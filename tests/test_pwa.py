"""PWA manifest、Service Worker、图标与模板声明验收。"""
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.getcode(), dict(response.headers), response.read()


def test_manifest_served_and_valid(live_server):
    code, _, body = _get(live_server.url + '/manifest.webmanifest')
    assert code == 200
    manifest = json.loads(body)
    assert manifest.get('name')
    assert manifest.get('start_url') == '/'
    assert manifest.get('display') == 'standalone'

    icons = manifest.get('icons') or []
    assert len(icons) >= 2, '至少要有 192 / 512 两个图标'
    for icon in icons:
        icon_url = urllib.parse.urljoin(live_server.url, icon['src'])
        icode, _, ibody = _get(icon_url)
        assert icode == 200
        assert ibody[:8] == b'\x89PNG\r\n\x1a\n', f"{icon['src']} 不是合法 PNG"


def test_service_worker_at_root(live_server):
    code, headers, body = _get(live_server.url + '/sw.js')
    assert code == 200
    assert 'javascript' in headers.get('Content-Type', '').lower()
    assert headers.get('Service-Worker-Allowed') == '/'
    assert b'addEventListener' in body
    assert b"addEventListener('fetch'" in body
    assert b'respondWith' in body


def test_icons_are_png(live_server):
    for size in (192, 512):
        code, _, body = _get(live_server.url + f'/static/icons/icon-{size}.png')
        assert code == 200
        assert body[:8] == b'\x89PNG\r\n\x1a\n', f'icon-{size} 不是 PNG'


def _assert_pwa_shell(html):
    assert '<link rel="manifest"' in html
    assert 'serviceWorker.register' in html


def test_index_html_has_pwa(live_server):
    code, _, body = _get(live_server.url + '/')
    assert code == 200
    html = body.decode('utf-8')
    _assert_pwa_shell(html)
    assert '/static/manifest.webmanifest' in html


def test_jm_view_html_has_manifest(live_server):
    album = os.path.join(live_server.root, '漫画A')
    query = urllib.parse.urlencode({'path': album})
    code, _, body = _get(live_server.url + '/jm_view?' + query)
    assert code == 200
    _assert_pwa_shell(body.decode('utf-8'))


def test_all_pwa_templates_include_mobile_meta_and_register_worker():
    root = Path(__file__).resolve().parents[1]
    template_dir = root / 'src/jm_view_server/templates'
    names = ('index.html', 'jm_view.html', 'message.html', 'upload.html',
             'login.html', 'download_error.html')
    for name in names:
        html = (template_dir / name).read_text(encoding='utf-8')
        assert '<meta name="mobile-web-app-capable" content="yes">' in html, name
        assert '<meta name="apple-mobile-web-app-capable" content="yes">' in html, name
        assert '<link rel="icon" type="image/png" href="/static/icons/icon-192.png">' in html, name
        _assert_pwa_shell(html)
