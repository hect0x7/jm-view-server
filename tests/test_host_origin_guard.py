"""Host / Origin 校验回归测试（防 DNS Rebinding 与跨站浏览器请求，CWE-346）。"""
import os
import sys
import tempfile

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from jm_view_server.app import JmServer


@pytest.fixture
def app_client(tmp_path):
    """创建隔离临时目录下的无密码 Flask 测试客户端。"""
    sample = tmp_path / 'sample.txt'
    sample.write_text('hello', encoding='utf-8')
    server = JmServer(str(tmp_path), '')
    server.register_routes()
    return server.app.test_client(), tmp_path, sample


@pytest.mark.parametrize('host', [
    'localhost',
    'localhost:8080',
    'localhost.:8080',
    'sub.localhost:8080',
    'my-mac.local',
    'my-mac.local:8080',
    '127.0.0.1',
    '127.0.0.1:8080',
    '[::1]',
    '[::1]:8080',
    '192.168.1.50',
    '192.168.1.50:8080',
    '10.0.0.8:8080',
    '100.64.0.12:8080',
])
def test_allowed_local_and_ip_hosts(app_client, host):
    client, _, _ = app_client
    resp = client.get('/api/info', headers={'Host': host})
    assert resp.status_code == 200


@pytest.mark.parametrize('host', [
    'attacker.example',
    'attacker.example:80',
    'attacker.example:8080',
    'localhost.attacker.example',
    '127.0.0.1.nip.io',
    '.local',
    '.localhost',
    'evil.com@127.0.0.1',
    '127.0.0.1, attacker.example',
    '127.0.0.1:notaport',
    '',
])
def test_blocks_dns_rebinding_and_malformed_hosts(app_client, host):
    client, _, sample = app_client
    assert client.get('/api/info', headers={'Host': host}).status_code == 403
    assert client.get(f'/view_file/?path={sample}', headers={'Host': host}).status_code == 403
    assert client.get('/', headers={'Host': host}).status_code == 403


def test_custom_allowed_hosts_env(app_client, monkeypatch):
    client, _, _ = app_client
    monkeypatch.setenv('JM_ALLOWED_HOSTS', 'comics.home.example, LAN-BOX.example:8443')
    assert client.get('/api/info', headers={'Host': 'comics.home.example:8080'}).status_code == 200
    assert client.get('/api/info', headers={'Host': 'lan-box.example'}).status_code == 200
    assert client.get('/api/info', headers={'Host': 'other.home.example'}).status_code == 403


def test_same_origin_and_cross_origin_requests(app_client):
    client, tmp_path, sample = app_client

    # 同源 Origin 放行
    resp = client.post(
        '/api/mkdir',
        data={'parent': str(tmp_path), 'name': 'ok_dir'},
        headers={'Host': '127.0.0.1:8080', 'Origin': 'http://127.0.0.1:8080'},
    )
    assert resp.status_code == 200
    assert (tmp_path / 'ok_dir').is_dir()

    # 默认端口隐式匹配（http 80）
    resp = client.get(
        '/api/info',
        headers={'Host': '127.0.0.1', 'Origin': 'http://127.0.0.1:80'},
    )
    assert resp.status_code == 200

    # 外部 Origin / 不同端口 / null Origin 均拦截
    for bad_origin in (
        'https://attacker.example',
        'http://127.0.0.1:9999',
        'https://127.0.0.1:8080',
        'null',
        'http://127.0.0.1:8080/extra',
    ):
        r_post = client.post(
            '/api/mkdir',
            data={'parent': str(tmp_path), 'name': 'blocked_dir'},
            headers={'Host': '127.0.0.1:8080', 'Origin': bad_origin},
        )
        assert r_post.status_code == 403
        r_get = client.get(
            f'/view_file/?path={sample}',
            headers={'Host': '127.0.0.1:8080', 'Origin': bad_origin},
        )
        assert r_get.status_code == 403
    assert not (tmp_path / 'blocked_dir').exists()


def test_sec_fetch_site_and_referer_rules(app_client):
    client, tmp_path, sample = app_client

    # 外部站点发起的跨站数据/动作请求必须被拦截（包括 GET /api/delete 和 GET /view_file/）
    assert client.get(
        f'/api/delete?path={sample}',
        headers={'Host': '127.0.0.1:8080', 'Sec-Fetch-Site': 'cross-site'},
    ).status_code == 403
    assert sample.exists()

    assert client.get(
        f'/view_file/?path={sample}',
        headers={'Host': '127.0.0.1:8080', 'Sec-Fetch-Site': 'cross-site'},
    ).status_code == 403

    assert client.post(
        '/api/mkdir',
        data={'parent': str(tmp_path), 'name': 'csrf_dir'},
        headers={'Host': '127.0.0.1:8080', 'Sec-Fetch-Site': 'cross-site'},
    ).status_code == 403

    # 无 Origin 但携带外部 Referer 的敏感请求同样拦截
    assert client.get(
        f'/api/delete?path={sample}',
        headers={'Host': '127.0.0.1:8080', 'Referer': 'https://attacker.example/exploit.html'},
    ).status_code == 403
    assert sample.exists()

    # 从外部聊天/网页点击链接打开主页仍正常放行
    assert client.get(
        '/',
        headers={
            'Host': '192.168.1.50:8080',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': 'https://chat.example/room',
        },
    ).status_code == 200

    # 同源 Sec-Fetch-Site / 同源 Referer 放行
    assert client.get(
        f'/view_file/?path={sample}',
        headers={
            'Host': '127.0.0.1:8080',
            'Sec-Fetch-Site': 'same-origin',
            'Referer': 'http://127.0.0.1:8080/jm_view?path=foo',
        },
    ).status_code == 200


def test_live_server_blocks_dns_rebinding_host_header(live_server):
    """真实 HTTP 端口模拟 DNS Rebinding：向 127.0.0.1 发恶意 Host 头被直接 403。"""
    target_file = os.path.join(live_server.root, 'readme.txt')

    ok = requests.get(live_server.url + '/view_file/', params={'path': target_file})
    assert ok.status_code == 200
    assert ok.text == 'hi'

    rebound = requests.get(
        live_server.url + '/view_file/',
        params={'path': target_file},
        headers={'Host': 'attacker.example'},
    )
    assert rebound.status_code == 403

    rebound_list = requests.get(
        live_server.url + '/api/list_files',
        params={'path': live_server.root},
        headers={'Host': 'rebind.attacker.example:80'},
    )
    assert rebound_list.status_code == 403
