"""设置中心外观功能的 Playwright 端到端验收。"""
import glob
import os
import tempfile

from PIL import Image


_test_bg_dir = None


def _bg_glob():
    if _test_bg_dir:
        return os.path.join(_test_bg_dir, 'background.*')
    return os.path.join(os.path.expanduser('~'), '.jm_view_server', 'background.*')


def _clean_bg():
    for path in glob.glob(_bg_glob()):
        try:
            os.remove(path)
        except OSError:
            pass


def setup_function(_):
    _clean_bg()


def teardown_function(_):
    _clean_bg()


def _png_path():
    fd, path = tempfile.mkstemp(suffix='.png', prefix='jmv_appearance_bg_')
    os.close(fd)
    Image.new('RGB', (60, 40), (20, 40, 80)).save(path)
    return path


def _open_settings(live_server, browser):
    page = browser.new_page()
    page.goto(live_server.url + '/')
    page.evaluate("localStorage.setItem('jmv-onboarding-settings-v1', '1')")
    page.goto(live_server.url + '/settings')
    page.wait_for_selector('#appearance')
    return page


def _brand(page):
    return page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()")


def test_settings_page_replaces_appearance_modal(live_server, browser):
    page = _open_settings(live_server, browser)
    assert page.title() == '设置 · jm-view-server'
    assert page.locator('.settings-section').count() == 6
    assert page.locator('#shortcutGrid kbd').count() > 0
    assert page.locator('.nav-item[href="/settings"]').count() == 1
    body = page.locator('#appearance').inner_text()
    assert '主题色' in body and '背景图片' in body and '背景淡化' in body


def test_sidebar_default_setting_does_not_jump_and_mentions_reload(live_server, browser):
    page = _open_settings(live_server, browser)
    page.locator('#browser').scroll_into_view_if_needed()
    before = page.eval_on_selector('.settings-content', 'element => element.scrollTop')

    page.click('#sidebarCollapsed')
    page.wait_for_selector('#toastHost')

    after = page.eval_on_selector('.settings-content', 'element => element.scrollTop')
    assert abs(after - before) < 4
    assert '刷新页面后生效' in page.inner_text('#toastHost')
    assert page.get_attribute('#sidebarCollapsed', 'aria-checked') == 'true'


def test_brand_color_swatch_and_persist(live_server, browser):
    page = _open_settings(live_server, browser)
    page.click('#brandSwatches [data-color="#e5484d"]')
    assert _brand(page) == '#e5484d'
    assert page.evaluate("localStorage.getItem('jmv-brand')") == '#e5484d'

    page.reload()
    page.wait_for_selector('#appearance')
    assert _brand(page) == '#e5484d'


def test_brand_color_picker_input(live_server, browser):
    page = _open_settings(live_server, browser)
    page.eval_on_selector(
        '#brandPicker',
        "el => { el.value = '#12a150'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert _brand(page) == '#12a150'
    assert page.evaluate("localStorage.getItem('jmv-brand')") == '#12a150'


def test_brand_reset_default(live_server, browser):
    page = _open_settings(live_server, browser)
    page.click('#brandSwatches [data-color="#e5484d"]')
    assert _brand(page) == '#e5484d'

    page.click('#brandReset')
    assert _brand(page) == '#5b5bd6'
    assert page.evaluate("localStorage.getItem('jmv-brand')") in (None, '')


def test_background_upload_and_opacity(live_server, browser):
    page = _open_settings(live_server, browser)
    image_path = _png_path()
    try:
        page.set_input_files('#backgroundFile', image_path)
        page.wait_for_function(
            "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    finally:
        os.remove(image_path)

    assert '/api/background' in page.eval_on_selector(
        'body', "e => getComputedStyle(e).backgroundImage")
    assert page.evaluate("localStorage.getItem('jmv-bg')").startswith('/api/background')

    page.eval_on_selector(
        '#backgroundOpacity',
        "el => { el.value = '70'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert abs(float(page.eval_on_selector('#appBgMask', 'e => e.style.opacity')) - 0.7) < 1e-6
    assert page.evaluate("localStorage.getItem('jmv-bg-opacity')") == '70'

    page.reload()
    page.wait_for_selector('#appearance')
    assert '/api/background' in page.eval_on_selector(
        'body', "e => getComputedStyle(e).backgroundImage")
    assert abs(float(page.eval_on_selector('#appBgMask', 'e => e.style.opacity')) - 0.7) < 1e-6


def test_clear_background(live_server, browser):
    page = _open_settings(live_server, browser)
    image_path = _png_path()
    try:
        page.set_input_files('#backgroundFile', image_path)
        page.wait_for_function(
            "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    finally:
        os.remove(image_path)

    page.click('#backgroundClear')
    page.wait_for_function(
        "() => !getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    assert page.evaluate("localStorage.getItem('jmv-bg')") in (None, '')
    assert page.eval_on_selector('#appBgMask', 'e => e.style.opacity') == '0'
