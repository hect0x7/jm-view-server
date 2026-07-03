"""
共享测试基建：启动一个无密码的 JmServer + 造测试图片目录，供 pytest / playwright 端到端验收复用。

用法：
    def test_x(live_server, page):        # playwright 端到端
        page.goto(live_server.url + '/')
    def test_y(live_server):              # 纯后端接口
        import requests; requests.get(live_server.url + '/api/...')

约定：服务以无密码启动（verify() 直接放行），cwd 切到测试数据目录，规避相对路径问题。
测试端口用高位 187xx，避免与他人历史进程冲突。
"""
import os
import sys
import socket
import time
import threading
import tempfile
import shutil
from dataclasses import dataclass

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


def _free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _make_testdata(root):
    """造测试目录：漫画A(5图/带images子目录)、漫画B(3图)、空文件夹、顶层散图+文本。"""
    from PIL import Image
    os.makedirs(os.path.join(root, '漫画A', 'images'), exist_ok=True)
    os.makedirs(os.path.join(root, '漫画B'), exist_ok=True)
    os.makedirs(os.path.join(root, '空文件夹'), exist_ok=True)
    for i in range(1, 6):
        Image.new('RGB', (80, 120), (30 * i % 255, 60, 120)).save(
            os.path.join(root, '漫画A', 'images', f'{i:02d}.jpg'))
    for i in range(1, 4):
        Image.new('RGB', (80, 120), (200, 30 * i % 255, 90)).save(
            os.path.join(root, '漫画B', f'{i}.png'))
    Image.new('RGB', (80, 120), (120, 120, 120)).save(os.path.join(root, 'cover.jpg'))
    with open(os.path.join(root, 'readme.txt'), 'w') as f:
        f.write('hi')


@dataclass
class LiveServer:
    url: str
    root: str  # 测试数据根目录


@pytest.fixture
def live_server():
    """每个测试独立一份数据目录 + 独立端口的 JmServer 实例（Flask dev server 线程内运行）。"""
    root = tempfile.mkdtemp(prefix='jmv_test_')
    _make_testdata(root)
    old_cwd = os.getcwd()
    os.chdir(root)

    from jm_view_server.app import JmServer
    port = _free_port()
    srv = JmServer(root, '')  # 无密码
    t = threading.Thread(
        target=lambda: srv.run(host='127.0.0.1', port=port), daemon=True)
    t.start()

    # 等端口就绪
    for _ in range(80):
        try:
            socket.create_connection(('127.0.0.1', port), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    else:
        os.chdir(old_cwd)
        shutil.rmtree(root, ignore_errors=True)
        pytest.fail(f'服务未能在 127.0.0.1:{port} 启动')

    yield LiveServer(url=f'http://127.0.0.1:{port}', root=root)

    os.chdir(old_cwd)
    shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def browser():
    """无插件依赖的 playwright chromium（headless）。用法：
        def test_x(live_server, browser):
            pg = browser.new_page(); pg.goto(live_server.url + '/')
    """
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()

