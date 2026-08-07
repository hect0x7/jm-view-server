import os
import socket
import threading
import time
import uuid
from dataclasses import dataclass
from urllib.parse import quote

import pytest

pytest.importorskip('playwright.sync_api')


@dataclass
class SafeColumnServer:
    url: str
    root: str
    test_root: str
    levels: list


def _free_port():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@pytest.fixture
def safe_column_server():
    root = os.environ.get('JMV_SAFE_TEST_ROOT')
    approved_root = os.environ.get('JMV_APPROVED_TEST_ROOT')
    if not root or not approved_root:
        pytest.skip('Set both safe and approved test roots explicitly')
    root = os.path.abspath(root)
    approved_root = os.path.abspath(approved_root)
    if os.path.normcase(os.path.realpath(root)) != os.path.normcase(os.path.realpath(approved_root)):
        pytest.fail('JMV_SAFE_TEST_ROOT does not match the approved test root')
    if not os.path.isdir(root):
        pytest.skip('JMV_SAFE_TEST_ROOT does not exist')

    base = os.path.join(root, '_jmv_column_' + uuid.uuid4().hex[:8])
    level_names = ['第一层', '第二层', '第三层', '第四层', '第五层']
    levels = []
    current = base
    os.mkdir(current)
    try:
        for name in level_names:
            current = os.path.join(current, name)
            os.mkdir(current)
            levels.append(current)

        from jm_view_server.app import JmServer
        port = _free_port()
        server = JmServer(root, '')
        thread = threading.Thread(
            target=lambda: server.run(host='127.0.0.1', port=port), daemon=True)
        thread.start()
        for _ in range(80):
            try:
                socket.create_connection(('127.0.0.1', port), 0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail('Column view test server did not start')

        yield SafeColumnServer(
            url=f'http://127.0.0.1:{port}',
            root=root,
            test_root=base,
            levels=levels,
        )
    finally:
        for directory in reversed(levels):
            if os.path.isdir(directory):
                os.rmdir(directory)
        if os.path.isdir(base):
            os.rmdir(base)


def _open_column(safe_column_server, browser, viewport=None):
    context = browser.new_context(viewport=viewport or {'width': 1440, 'height': 900})
    page = context.new_page()
    page.add_init_script("localStorage.setItem('jmv-onboarding-settings-v1', '1')")
    page.goto(safe_column_server.url + '/?path=' + quote(safe_column_server.test_root))
    page.click('#segColumn')
    page.wait_for_selector('.finder-column.is-active .column-item-main')
    return context, page


def _open_named_folder(page, name):
    page.locator('.finder-column.is-active .column-item-main', has_text=name).click()
    page.wait_for_function(
        "name => document.querySelector('.finder-column.is-active .finder-column-title').textContent === name",
        arg=name,
    )


def test_column_view_advances_and_keeps_four_columns(safe_column_server, browser):
    context, page = _open_column(safe_column_server, browser)
    try:
        page.evaluate("""() => {
            window.renameItem = (...args) => { window.__columnRename = args; };
        }""")
        page.locator('.finder-column.is-active .column-more-button', has_text='⋯').click()
        assert page.locator('.finder-column.is-active .column-item-actions button').count() == 1
        assert page.locator('.column-jm-button').count() == 0
        menu = page.locator('.column-operation-menu')
        menu.wait_for()
        labels = menu.locator('.column-operation-item').all_text_contents()
        assert labels == ['进入文件夹', '重命名', '移动到…', '在文件管理器中显示', '删除']
        menu.locator('.column-operation-item', has_text='重命名').click()
        rename_args = page.evaluate('window.__columnRename')
        assert rename_args[1] == '第一层'

        operations = page.locator('#columnOperationsToggle')
        assert operations.is_visible()
        assert operations.get_attribute('aria-checked') == 'true'
        operations.click()
        assert operations.get_attribute('aria-checked') == 'false'
        assert page.evaluate("localStorage.getItem('jmv-browser-operations')") == '0'
        assert page.locator('.finder-column.is-active .column-item-actions:visible').count() == 0
        operations.click()
        assert operations.get_attribute('aria-checked') == 'true'
        assert page.locator('.finder-column.is-active .column-item-actions:visible').count() == 1

        for name in ['第一层', '第二层', '第三层', '第四层', '第五层']:
            _open_named_folder(page, name)

        columns = page.locator('.finder-column')
        assert columns.count() == 4
        titles = columns.locator('.finder-column-title').all_text_contents()
        assert titles == ['第二层', '第三层', '第四层', '第五层']
        assert page.locator('.finder-column.is-active .column-state').inner_text() == '目录为空'
        assert page.evaluate("localStorage.getItem('jmv-view')") == 'column'

        page.set_viewport_size({'width': 1000, 'height': 900})
        page.wait_for_timeout(100)
        assert page.locator('.finder-column').count() == 4

        page.click('#btn-back')
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第四层'"
        )
        titles = page.locator('.finder-column .finder-column-title').all_text_contents()
        assert titles == ['第一层', '第二层', '第三层', '第四层']

        page.go_forward()
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第五层'"
        )
        page.go_back()
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第四层'"
        )

        page.reload()
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第四层'"
        )
        assert page.locator('.finder-column .finder-column-title').all_text_contents() == [
            '第一层', '第二层', '第三层', '第四层'
        ]

        page.locator('#columnOperationsToggle').click()
        assert page.locator('#columnOperationsToggle').get_attribute('aria-checked') == 'false'
        page.reload()
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第四层'"
        )
        assert page.locator('#columnOperationsToggle').get_attribute('aria-checked') == 'false'
        assert page.locator('.finder-column.is-active .column-item-actions:visible').count() == 0
        page.locator('#columnOperationsToggle').click()

        page.click('#segList')
        page.wait_for_load_state('load')
        assert not page.locator('#columnOperationsToggle').is_visible()
        assert page.evaluate("localStorage.getItem('jmv-view')") == 'list'
        assert page.locator('#currentPathText').get_attribute('data-path').endswith('第四层')
    finally:
        context.close()


def test_column_view_keyboard_and_mobile_single_column(safe_column_server, browser):
    context, page = _open_column(
        safe_column_server,
        browser,
        viewport={'width': 800, 'height': 900},
    )
    try:
        first = page.locator('.finder-column.is-active .column-item-main', has_text='第一层')
        first.focus()
        first.press('ArrowRight')
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第一层'"
        )
        page.wait_for_function("() => (document.activeElement?.textContent || '').includes('第二层')")
        assert page.locator('.finder-column:visible').count() == 1
        assert page.locator('#columnBack').is_visible()
        assert page.locator('#columnBack').is_enabled()
        assert page.locator('#columnBack').evaluate(
            "element => element.getBoundingClientRect().height"
        ) >= 44
        assert page.locator('.finder-column.is-active .column-more-button').first.evaluate(
            "element => ({ opacity: getComputedStyle(element).opacity, width: element.getBoundingClientRect().width })"
        ) == {'opacity': '1', 'width': 44}

        page.keyboard.press('ArrowLeft')
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent.startsWith('_jmv_column_')"
        )
        assert page.locator('.finder-column:visible').count() == 1
    finally:
        context.close()


def test_column_view_direct_deep_link_back_stays_in_app(safe_column_server, browser):
    context = browser.new_context(viewport={'width': 800, 'height': 520})
    page = context.new_page()
    page.add_init_script("localStorage.setItem('jmv-onboarding-settings-v1', '1')")
    try:
        page.goto(safe_column_server.url + '/?path=' + quote(safe_column_server.levels[3]))
        page.click('#segColumn')
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第四层'"
        )

        page.click('#columnBack')
        page.wait_for_function(
            "() => document.querySelector('.finder-column.is-active .finder-column-title').textContent === '第三层'"
        )
        assert page.url.startswith(safe_column_server.url + '/')
        assert page.locator('.finder-column:visible').count() == 1

        page.locator('.finder-column.is-active .column-more-button').first.click()
        menu = page.locator('.column-operation-menu')
        menu.wait_for()
        assert menu.evaluate(
            "element => element.scrollHeight <= window.innerHeight - 16 || getComputedStyle(element).overflowY === 'auto'"
        )
    finally:
        context.close()
