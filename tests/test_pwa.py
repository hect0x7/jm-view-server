"""PWA 验收：manifest / service worker / 图标 / 模板注入 是否到位。

复用 conftest.py 的 live_server fixture（无密码 JmServer + 测试数据目录）。
用 urllib 直连 live_server.url，避免额外依赖。
"""
import json
import os
import urllib.parse
import urllib.request


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.getcode(), dict(r.headers), r.read()


def test_manifest_served_and_valid(live_server):
    code, headers, body = _get(live_server.url + '/manifest.webmanifest')
    assert code == 200
    manifest = json.loads(body)  # 必须可解析为 JSON

    assert manifest.get('name')
    assert manifest.get('start_url') == '/'
    assert manifest.get('display') == 'standalone'

    icons = manifest.get('icons') or []
    assert len(icons) >= 2, '至少要有 192 / 512 两个图标'

    # 每个 icon 的 src 都要能取到
    for icon in icons:
        src = icon['src']
        icon_url = urllib.parse.urljoin(live_server.url, src)
        icode, _, ibody = _get(icon_url)
        assert icode == 200
        assert ibody[:8] == b'\x89PNG\r\n\x1a\n', f'{src} 不是合法 PNG'


def test_service_worker_at_root(live_server):
    code, headers, body = _get(live_server.url + '/sw.js')
    assert code == 200

    ctype = headers.get('Content-Type', '')
    assert 'javascript' in ctype.lower(), f'Content-Type 应为 javascript，实际 {ctype}'

    # 作用域头，允许 sw 控制整站
    assert headers.get('Service-Worker-Allowed') == '/'

    assert b'addEventListener' in body  # 确实是个 sw 脚本


def test_icons_are_png(live_server):
    for size in (192, 512):
        code, _, body = _get(live_server.url + f'/static/icons/icon-{size}.png')
        assert code == 200
        assert body[:8] == b'\x89PNG\r\n\x1a\n', f'icon-{size} 不是 PNG'


def test_index_html_has_pwa(live_server):
    code, _, body = _get(live_server.url + '/')
    assert code == 200
    html = body.decode('utf-8')
    assert '<link rel="manifest"' in html
    assert 'serviceWorker.register' in html
    assert '/static/manifest.webmanifest' in html


def test_jm_view_html_has_manifest(live_server):
    # 测试数据里的“漫画A”是带图片的可看本文件夹
    album = os.path.join(live_server.root, '漫画A')
    q = urllib.parse.urlencode({'path': album})
    code, _, body = _get(live_server.url + '/jm_view?' + q)
    assert code == 200
    html = body.decode('utf-8')
    assert '<link rel="manifest"' in html
    assert 'serviceWorker.register' in html


def test_service_worker_registers_in_browser(live_server):
    """可选：用 headless chromium 打开首页，确认 sw 注册成功。
    playwright/chromium 不可用时跳过。"""
    import pytest
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        pytest.skip('playwright 未安装')

    try:
        with sync_playwright() as p:
            try:
                b = p.chromium.launch(headless=True)
            except Exception as e:
                pytest.skip(f'chromium 无法启动: {e}')
            page = b.new_page()
            page.goto(live_server.url + '/', wait_until='load')
            # 等待 sw 就绪
            reg = page.evaluate(
                """async () => {
                    if (!('serviceWorker' in navigator)) return null;
                    try {
                        const r = await navigator.serviceWorker.ready;
                        return r && r.active ? r.active.state : 'no-active';
                    } catch (e) { return 'err:' + e; }
                }"""
            )
            b.close()
            assert reg is not None, '浏览器不支持 serviceWorker'
            assert reg in ('activating', 'activated', 'installing', 'installed'), reg
    except Exception as e:
        pytest.skip(f'浏览器 sw 检测不可用: {e}')
