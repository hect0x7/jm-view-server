"""
Android / Termux 兼容性单元测试。
"""
import os
import socket
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from jm_view_server import cli, driver  # noqa: E402
from jm_view_server.app import JmServer  # noqa: E402
from jm_view_server.files import FileManager  # noqa: E402


def test_is_android_env_detection(monkeypatch):
    monkeypatch.setattr(driver.os, 'name', 'posix')
    for key in ('ANDROID_ROOT', 'ANDROID_DATA', 'TERMUX_VERSION'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(driver.os.path, 'exists', lambda p: False)
    assert driver.is_android() is False

    monkeypatch.setenv('TERMUX_VERSION', '0.118.0')
    assert driver.is_android() is True

    monkeypatch.delenv('TERMUX_VERSION', raising=False)
    monkeypatch.setenv('ANDROID_ROOT', '/system')
    assert driver.is_android() is True

    monkeypatch.setattr(driver.os, 'name', 'nt')
    assert driver.is_android() is False


def test_get_lan_ip_prefers_wifi_over_cellular_and_vpn(monkeypatch):
    import psutil

    def fake_addrs():
        return {
            'lo': [SimpleNamespace(family=socket.AF_INET, address='127.0.0.1')],
            'rmnet0': [SimpleNamespace(family=socket.AF_INET, address='10.0.0.2')],
            'tun0': [SimpleNamespace(family=socket.AF_INET, address='172.16.0.1')],
            'wlan0': [SimpleNamespace(family=socket.AF_INET, address='192.168.0.10')],
        }

    def fake_stats():
        return {
            'lo': SimpleNamespace(isup=True),
            'rmnet0': SimpleNamespace(isup=True),
            'tun0': SimpleNamespace(isup=True),
            'wlan0': SimpleNamespace(isup=True),
        }

    monkeypatch.setattr(psutil, 'net_if_addrs', fake_addrs)
    monkeypatch.setattr(psutil, 'net_if_stats', fake_stats)
    assert driver.get_lan_ip() == '192.168.0.10'


def test_get_lan_ip_falls_back_to_ioctl_when_psutil_blocked(monkeypatch):
    import psutil

    def blocked_addrs():
        raise PermissionError('NETLINK_ROUTE blocked by SELinux')

    monkeypatch.setattr(psutil, 'net_if_addrs', blocked_addrs)
    monkeypatch.setattr(driver.os, 'name', 'posix')
    monkeypatch.setattr(
        driver,
        '_get_iface_ipv4_ioctl',
        lambda ifname: '192.168.0.20' if ifname == 'wlan0' else None,
    )
    assert driver.get_lan_ip() == '192.168.0.20'


def test_drivers_list_uses_android_roots(monkeypatch):
    monkeypatch.setattr(driver.os, 'name', 'posix')
    monkeypatch.setattr(driver, 'is_android', lambda: True)
    monkeypatch.setattr(driver, 'get_android_drivers', lambda: ['/storage/emulated/0', '/data/data/com.termux/files/home'])

    fm = FileManager('/storage/emulated/0', '/storage/emulated/0')
    monkeypatch.setattr('jm_view_server.files.os.name', 'posix')
    assert fm.DRIVERS_LIST == ['/storage/emulated/0', '/data/data/com.termux/files/home']


def test_cli_default_port_for_android(monkeypatch):
    monkeypatch.setattr(driver, 'is_android', lambda: False)
    assert cli.build_parser().parse_args([]).port == JmServer.DEFAULT_PORT

    monkeypatch.setattr(driver, 'is_android', lambda: True)
    assert cli.build_parser().parse_args([]).port == 8080


def test_android_delete_fallback_and_root_guard(tmp_path, monkeypatch):
    root_dir = tmp_path / 'comics'
    album_dir = root_dir / '.hidden_album'
    album_dir.mkdir(parents=True)
    img1 = album_dir / '001.jpg'
    img1.write_bytes(b'first')

    monkeypatch.setattr(driver, 'is_android', lambda: True)
    monkeypatch.setattr(
        'jm_view_server.routes.files.send2trash',
        lambda _p: (_ for _ in ()).throw(PermissionError('fuse trash unsupported')),
    )

    server = JmServer(str(root_dir), '')
    server.register_routes()
    client = server.app.test_client()

    # 1. 删除普通文件时，send2trash 抛 PermissionError 后应自动移入 .jm_trash
    resp = client.post('/api/delete', data={'path': str(img1)})
    assert resp.status_code == 200
    assert resp.get_json() == {'status': 'ok'}
    assert not img1.exists()
    trashed1 = root_dir / '.jm_trash' / '001.jpg'
    assert trashed1.read_bytes() == b'first'

    # 2. 同名再次删除应生成不覆盖的新文件名
    img1_dup = album_dir / '001.jpg'
    img1_dup.write_bytes(b'second')
    resp2 = client.post('/api/delete', data={'path': str(img1_dup)})
    assert resp2.status_code == 200
    assert not img1_dup.exists()
    trashed2 = root_dir / '.jm_trash' / '001 (1).jpg'
    assert trashed2.read_bytes() == b'second'

    # 3. 禁止直接操作 Android 存储根挂载点本身
    monkeypatch.setattr('jm_view_server.routes.files.os.name', 'posix')
    monkeypatch.setattr('jm_view_server.routes.files.os.path.abspath', lambda p: p)
    monkeypatch.setattr('jm_view_server.routes.files.os.path.realpath', lambda p: p)
    monkeypatch.setattr('jm_view_server.routes.files.os.path.splitdrive', lambda p: ('', p))
    resp_guard = client.post('/api/delete', data={'path': '/storage/emulated/0'})
    assert resp_guard.status_code == 403
