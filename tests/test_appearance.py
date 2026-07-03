"""
自定义外观前端验收：外观设置面板（主题色 / 背景图 / 背景淡化）。
用 conftest.py 的 live_server + browser fixture（无 pytest-playwright，手动 new_page）。

背景图上传接口 /api/upload_bg 已由后端实现（见 test_background.py），
本文件真实走接口上传；为避免污染真实用户目录 ~/.jm_view_server，
每个测试 setup/teardown 清理 background.*。
"""
import io
import os
import glob

from PIL import Image


BG_GLOB = os.path.join(os.path.expanduser('~'), '.jm_view_server', 'background.*')


def _clean_bg():
    for f in glob.glob(BG_GLOB):
        try:
            os.remove(f)
        except OSError:
            pass


def setup_function(_):
    _clean_bg()


def teardown_function(_):
    _clean_bg()


def _png_path(tmp='/tmp/jmv_appearance_bg.png'):
    Image.new('RGB', (60, 40), (20, 40, 80)).save(tmp)
    return tmp


def _open_index(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('#appearanceEntry')
    return pg


def _brand(pg):
    return pg.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()")


# ---------- 入口 + 面板 ----------

def test_open_appearance_panel(live_server, browser):
    """点“外观设置”入口 → 面板出现，含三块。"""
    pg = _open_index(live_server, browser)
    assert pg.eval_on_selector('#appearanceEntry', 'e => e.innerText').strip() == '外观设置'
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')
    body = pg.eval_on_selector('.appearance-body', 'e => e.innerText')
    assert '主题色' in body and '背景图' in body and '背景淡化' in body


# ---------- 主题色 ----------

def test_brand_color_swatch_and_persist(live_server, browser):
    """点预设色板 → --brand 变化 + localStorage 记忆；刷新后仍生效。"""
    pg = _open_index(live_server, browser)
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')

    # 选一个非默认预设（红色 #e5484d）
    pg.click('.appearance-swatch[data-color="#e5484d"]')
    assert _brand(pg) == '#e5484d'
    assert pg.evaluate("localStorage.getItem('jmv-brand')") == '#e5484d'

    # 刷新后恢复
    pg.reload()
    pg.wait_for_selector('#appearanceEntry')
    assert _brand(pg) == '#e5484d'


def test_brand_color_picker_input(live_server, browser):
    """取色器 input 事件 → --brand 跟随。"""
    pg = _open_index(live_server, browser)
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')
    pg.eval_on_selector(
        '#apColor',
        "el => { el.value = '#12a150'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert _brand(pg) == '#12a150'
    assert pg.evaluate("localStorage.getItem('jmv-brand')") == '#12a150'


def test_brand_reset_default(live_server, browser):
    """恢复默认 → --brand 回 #5b5bd6，localStorage 清空。"""
    pg = _open_index(live_server, browser)
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')
    pg.click('.appearance-swatch[data-color="#e5484d"]')
    assert _brand(pg) == '#e5484d'

    pg.click('#apBrandReset')
    assert _brand(pg) == '#5b5bd6'
    assert pg.evaluate("localStorage.getItem('jmv-brand')") in (None, '')


# ---------- 背景图（真实上传） + 透明度 ----------

def test_background_upload_and_opacity(live_server, browser):
    """真实上传背景图 → body 有 background-image 含 /api/background；
    滑块启用后拖动 → 遮罩 opacity 变化 + localStorage 记忆；刷新恢复。"""
    pg = _open_index(live_server, browser)
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')

    # 滑块初始禁用（无背景）
    assert pg.eval_on_selector('#apOpacity', 'e => e.disabled') is True

    pg.set_input_files('#apFile', _png_path())
    # 等待上传完成：body 拿到背景图
    pg.wait_for_function(
        "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    bg = pg.eval_on_selector('body', "e => getComputedStyle(e).backgroundImage")
    assert '/api/background' in bg
    assert pg.evaluate("localStorage.getItem('jmv-bg')").startswith('/api/background')

    # 滑块解禁 → 拖到 70
    assert pg.eval_on_selector('#apOpacity', 'e => e.disabled') is False
    pg.eval_on_selector(
        '#apOpacity',
        "el => { el.value = '70'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    mask_op = pg.eval_on_selector('#appBgMask', 'e => e.style.opacity')
    assert abs(float(mask_op) - 0.7) < 1e-6
    assert pg.evaluate("localStorage.getItem('jmv-bg-opacity')") == '70'

    # 刷新恢复：背景图仍在，遮罩 opacity 恢复到 0.7
    pg.reload()
    pg.wait_for_selector('#appearanceEntry')
    assert '/api/background' in pg.eval_on_selector('body', "e => getComputedStyle(e).backgroundImage")
    assert abs(float(pg.eval_on_selector('#appBgMask', 'e => e.style.opacity')) - 0.7) < 1e-6


def test_clear_background(live_server, browser):
    """清除背景 → body 无背景图，localStorage jmv-bg 清空，滑块禁用。"""
    pg = _open_index(live_server, browser)
    pg.click('#appearanceEntry')
    pg.wait_for_selector('#appearanceModal.open')
    pg.set_input_files('#apFile', _png_path())
    pg.wait_for_function(
        "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")

    pg.click('#apClearBg')
    pg.wait_for_function(
        "() => !getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    assert pg.evaluate("localStorage.getItem('jmv-bg')") in (None, '')
    assert pg.eval_on_selector('#apOpacity', 'e => e.disabled') is True
