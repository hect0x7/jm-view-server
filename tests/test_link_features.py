import os
import struct

import pytest

from jm_view_server.files import FileManager
from jm_view_server.shortcuts import read_link_info_path


def write_location_link(shortcut, target, *, unicode=True):
    """Small LinkInfo-only fixture, including deliberately lossy ANSI data."""
    ansi = target.encode('mbcs' if os.name == 'nt' else 'cp1252', errors='replace') + b'\0'
    volume = struct.pack('<IIII', 17, 3, 0, 16) + b'\0'
    header_size = 36 if unicode else 28
    local_offset = header_size + len(volume)
    suffix_offset = local_offset + len(ansi)
    payload = volume + ansi + b'\0'
    fields = [header_size + len(payload), header_size, 1, header_size, local_offset, 0, suffix_offset]
    if unicode:
        unicode_offset = header_size + len(payload)
        encoded = target.encode('utf-16-le') + b'\0\0'
        fields.extend([unicode_offset, unicode_offset + len(encoded)])
        payload += encoded + b'\0\0'
        fields[0] = header_size + len(payload)
    header = bytearray(76)
    struct.pack_into('<I', header, 0, 76)
    header[4:20] = bytes.fromhex('0114020000000000c000000000000046')
    struct.pack_into('<I', header, 20, 2)
    shortcut.write_bytes(header + struct.pack('<' + 'I' * len(fields), *fields) + payload)


def test_unicode_link_resolves_chinese_target_and_navigation(tmp_path):
    target = tmp_path / '中文目标与表情🌸'
    target.mkdir()
    shortcut = tmp_path / '入口.lnk'
    write_location_link(shortcut, str(target))
    manager = FileManager(str(tmp_path), str(tmp_path))
    info = manager.build_one_path_info(str(shortcut))
    assert info['link_broken'] is False
    assert info['target_path'] == str(target).replace('\\', '/')
    assert info['href'] == '/?path=' + info['quoted_path']
    assert info['name'] == shortcut.name
    assert info['manage_quoted_path'] != info['quoted_path']


@pytest.mark.skipif(os.name != 'nt', reason='Windows ANSI code page')
def test_ansi_link_uses_system_code_page(tmp_path):
    target = tmp_path / '中文目标'
    try:
        str(target).encode('mbcs')
    except UnicodeEncodeError:
        pytest.skip('Current Windows code page cannot represent Chinese')
    target.mkdir()
    shortcut = tmp_path / '入口.lnk'
    write_location_link(shortcut, str(target), unicode=False)
    assert FileManager.get_target_path(str(shortcut)) == str(target).replace('\\', '/')


def test_missing_unicode_target_keeps_readable_path(tmp_path):
    shortcut = tmp_path / '失效.lnk'
    target = tmp_path / '不存在的中文目录🌸'
    write_location_link(shortcut, str(target))
    info = FileManager(str(tmp_path), str(tmp_path)).build_one_path_info(str(shortcut))
    assert info['link_broken'] is True
    assert info['target_path'] == str(target).replace('\\', '/')


def test_truncated_link_info_returns_none(tmp_path):
    shortcut = tmp_path / '损坏.lnk'
    write_location_link(shortcut, str(tmp_path))
    shortcut.write_bytes(shortcut.read_bytes()[:-3])
    assert read_link_info_path(shortcut) is None


@pytest.mark.skipif(os.name != 'nt', reason='Windows UNC paths')
def test_fallback_preserves_network_share_prefix(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import pylnk3

    shortcut = tmp_path / '网络入口.lnk'
    shortcut.write_bytes(b'lnk')
    monkeypatch.setattr(pylnk3, 'parse', lambda _: SimpleNamespace(path=r'\\server.example\share\中文目标'))
    monkeypatch.setattr(os.path, 'exists', lambda _: False)
    assert FileManager.get_target_path(str(shortcut)) == '//server.example/share/中文目标'


@pytest.mark.parametrize('directory', [True, False])
def test_shortcut_target_link_is_clickable_and_reaches_target(tmp_path, monkeypatch, directory):
    from html.parser import HTMLParser
    from jm_view_server.app import JmServer
    import jm_view_server.routes.pages as pages

    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setattr(pages, 'get_lan_ip', lambda: '127.0.0.1')
    monkeypatch.setattr(FileManager, 'DRIVERS_LIST', property(lambda self: []))
    shared = tmp_path / 'shared'
    shared.mkdir()
    target = tmp_path / ('中文目标目录' if directory else '中文文件.txt')
    if directory:
        target.mkdir()
        (target / '跳转成功.txt').write_text('ok', encoding='utf-8')
    else:
        target.write_bytes(b'file target content')
    shortcut = shared / '入口.lnk'
    write_location_link(shortcut, str(target))
    server = JmServer(str(shared), '')
    server.register_routes()
    client = server.app.test_client()

    class TargetLinks(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links = []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'a' and 'link-target' in attrs.get('class', '').split():
                self.links.append(attrs['href'])

    response = client.get('/')
    parser = TargetLinks()
    parser.feed(response.get_data(as_text=True))
    assert len(parser.links) == 2  # List and grid both expose a real link.
    assert parser.links[0] == parser.links[1]
    reached = client.get(parser.links[0])
    assert reached.status_code == 200
    if directory:
        assert '跳转成功.txt' in reached.get_data(as_text=True)
    else:
        assert reached.get_data() == b'file target content'
    reached.close()


def test_link_keeps_shortcut_identity_and_exposes_target(tmp_path, monkeypatch):
    target = tmp_path / '目标目录'
    target.mkdir()
    shortcut = tmp_path / '入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: str(target))

    info = manager.build_one_path_info(str(shortcut))

    assert info['name'] == '入口.lnk'
    assert info['is_link'] is True
    assert info['type'] == 'dir'
    assert info['target_path'] == str(target)
    assert info['path'] == str(target)
    assert info['manage_quoted_path'] != info['quoted_path']


def test_broken_link_does_not_recurse(tmp_path, monkeypatch):
    shortcut = tmp_path / '失效入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: None)

    info = manager.build_one_path_info(str(shortcut))

    assert info['is_link'] is True
    assert info['link_broken'] is True
    assert info['target_type'] == 'missing'
    assert info['target_path'] == '无法解析目标'
    assert info['href'] == 'javascript:void(0)'


def test_circular_link_is_reported_as_broken(tmp_path, monkeypatch):
    shortcut = tmp_path / '循环入口.lnk'
    shortcut.write_bytes(b'lnk')

    manager = FileManager(str(tmp_path), str(tmp_path))
    monkeypatch.setattr(manager, 'get_target_path', lambda _: str(shortcut))

    info = manager.build_one_path_info(str(shortcut))

    assert info['link_broken'] is True
    assert info['target_path'] == '检测到循环链接'
