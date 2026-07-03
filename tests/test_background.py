"""
自定义背景图上传接口验收：/api/upload_bg /api/background /api/background/clear。
用 conftest.py 的 live_server fixture + requests 直接打接口。

注意：背景图存到 ~/.jm_view_server 是全局用户目录（非测试临时目录），
每个测试 setup/teardown 都用 glob 清理 ~/.jm_view_server/background.*，避免污染真实环境。
"""
import io
import os
import glob

import requests
from PIL import Image


BG_GLOB = os.path.join(os.path.expanduser('~'), '.jm_view_server', 'background.*')


def _clean_bg():
    for f in glob.glob(BG_GLOB):
        try:
            os.remove(f)
        except OSError:
            pass


def _png_bytes():
    buf = io.BytesIO()
    Image.new('RGB', (40, 40), (12, 34, 56)).save(buf, format='PNG')
    buf.seek(0)
    return buf.getvalue()


def setup_function(_):
    _clean_bg()


def teardown_function(_):
    _clean_bg()


def test_upload_and_get_background(live_server):
    """上传 png → 200 + 返回 url；GET /api/background → 200 且为 PNG 字节。"""
    resp = requests.post(live_server.url + '/api/upload_bg',
                         files={'file': ('bg.png', _png_bytes(), 'image/png')})
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'ok'
    assert body['url'].startswith('/api/background')

    got = requests.get(live_server.url + '/api/background')
    assert got.status_code == 200
    # PNG 魔数
    assert got.content[:8] == b'\x89PNG\r\n\x1a\n'


def test_upload_non_image_rejected(live_server):
    """上传非图片（.txt 内容）→ 4xx，且背景图未被写入（/api/background 仍 404）。"""
    resp = requests.post(live_server.url + '/api/upload_bg',
                         files={'file': ('note.txt', b'hello world', 'text/plain')})
    assert 400 <= resp.status_code < 500

    got = requests.get(live_server.url + '/api/background')
    assert got.status_code == 404


def test_clear_background(live_server):
    """先上传，clear 后 GET /api/background → 404。"""
    requests.post(live_server.url + '/api/upload_bg',
                  files={'file': ('bg.png', _png_bytes(), 'image/png')})
    assert requests.get(live_server.url + '/api/background').status_code == 200

    cleared = requests.post(live_server.url + '/api/background/clear')
    assert cleared.status_code == 200
    assert cleared.json()['status'] == 'ok'

    assert requests.get(live_server.url + '/api/background').status_code == 404


def test_background_404_when_never_uploaded(live_server):
    """未上传时 GET /api/background → 404。"""
    assert requests.get(live_server.url + '/api/background').status_code == 404
