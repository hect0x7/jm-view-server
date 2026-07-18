"""
看本阅读页（jm_view.html）前端增强功能的 playwright 端到端验收。

复用 conftest.py 的 live_server（无密码 JmServer + 测试数据目录，漫画A 有 5 图）
和 browser（headless chromium，无 pytest-playwright 插件，用 browser.new_page()）。

看本 URL：live_server.url + '/jm_view?path=<漫画A绝对路径>&openFromDir=<父目录>'
（app.py 的 jm_view 路由参数名 path / openFromDir，title 取文件夹名“漫画A”）
"""
import os
from urllib.parse import quote


def _view_url(live_server):
    # 漫画A 的 5 张图放在 images 子目录下（get_jm_view_images 只读入参目录本层，
    # 不递归子目录），故看本入口指向 漫画A/images，标题即“images”。
    album = os.path.join(live_server.root, '漫画A', 'images')
    return (live_server.url + '/jm_view?path=' + quote(album) +
            '&openFromDir=' + quote(os.path.join(live_server.root, '漫画A')))


def _open(ctx, live_server):
    """在给定 context 内新开页并加载看本页，等脚本就绪。"""
    pg = ctx.new_page()
    pg.goto(_view_url(live_server))
    pg.wait_for_selector('#stream .scramble-page', state='attached')
    # 等页面脚本执行完（TOTAL 计算、事件绑定）
    pg.wait_for_function('() => window.icon && document.querySelectorAll(".scramble-page").length > 0')
    return pg


def _open_with_preferences(ctx, live_server, preferences):
    pg = ctx.new_page()
    pg.goto(live_server.url + '/')
    pg.evaluate(
        "prefs => Object.entries(prefs).forEach(([key, value]) => localStorage.setItem(key, value))",
        preferences,
    )
    pg.goto(_view_url(live_server))
    pg.wait_for_selector('#stream .scramble-page', state='attached')
    pg.wait_for_function('() => window.icon && document.querySelectorAll(".scramble-page").length > 0')
    return pg


# ---------- 项1：阅读进度记忆 ----------
def test_progress_memory(browser, live_server):
    ctx = browser.new_context()  # 同一 context 共享 localStorage，模拟重开页面
    pg = _open(ctx, live_server)
    # 滚动到第 3 页（索引 2）
    pg.eval_on_selector('#page_2', 'el => el.scrollIntoView()')
    # 触发滚动节流写入后，主动等待 localStorage 落盘
    pg.wait_for_timeout(500)
    # 强制再滚动一下确保 scroll 事件与节流写入发生
    pg.evaluate('window.scrollBy(0, 1)')
    pg.wait_for_timeout(500)

    key = 'jmv-progress:images'  # 看本目录为 漫画A/images，标题即 images
    saved = pg.evaluate("k => localStorage.getItem(k)", key)
    assert saved is not None, 'localStorage 未记录阅读进度'
    assert int(saved) >= 2, f'记录的页索引应 >=2，实际 {saved}'
    pg.close()

    # 同 context 内重新打开同 URL（localStorage 保留），应出现进度提示条
    pg2 = _open(ctx, live_server)
    pg2.wait_for_selector('.resume-bar.show', timeout=3000)
    assert pg2.is_visible('.resume-bar.show')
    # 点击“跳转”后滚动位置前移
    pg2.click('.resume-bar .resume-go')
    pg2.wait_for_timeout(600)
    assert pg2.evaluate('window.scrollY') > 0
    pg2.close()
    ctx.close()


# ---------- 项2：键盘快捷键 ----------
def test_keyboard_shortcuts(browser, live_server):
    pg = _open(browser.new_context(), live_server)
    # 先加载全部图片，稳定文档高度（避免懒加载中途布局跳动导致 scrollY 断言抖动）
    pg.click('#loadAll')
    pg.wait_for_function(
        '() => Array.from(document.querySelectorAll(".page-img"))'
        '.every(im => im.complete && im.naturalHeight > 0)')
    pg.wait_for_timeout(200)
    assert pg.evaluate('window.scrollY') == 0

    # ArrowRight → 下一页，scrollY 增大
    pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(600)
    assert pg.evaluate('window.scrollY') > 0, 'ArrowRight 后未向下滚动'

    # End → 滚到最后一页顶部（block:start），全图已加载、布局稳定，scrollY 应达最后一页 offsetTop 附近
    pg.keyboard.press('End')
    pg.wait_for_timeout(900)
    reached_last = pg.evaluate(
        '() => { var ps=document.querySelectorAll(".scramble-page");'
        'var last=ps[ps.length-1];'
        'return window.scrollY >= last.offsetTop - 30; }')
    assert reached_last, 'End 后未滚到最后一页'

    # Home → 回顶部（文档很高时平滑滚动耗时较长，轮询等待到达顶部）
    pg.keyboard.press('Home')
    pg.wait_for_function('() => window.scrollY < 5', timeout=5000)
    assert pg.evaluate('window.scrollY') < 5, 'Home 后未回顶部'

    # g → 打开跳页浮窗
    pg.keyboard.press('g')
    pg.wait_for_timeout(300)
    assert pg.evaluate("() => document.getElementById('jumpPop').classList.contains('show')"), \
        'g 未打开跳页浮窗'
    pg.close()


# ---------- 单页阅读、适配与快捷键 ----------
def test_single_page_mode_navigation_and_help(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'single',
        'jmv-single-fit': 'contain',
    })

    assert pg.eval_on_selector('body', 'e => e.classList.contains("reader-single")')
    assert pg.eval_on_selector('#stream', 'e => e.classList.contains("reader-single-mode")')
    assert not pg.eval_on_selector('#stream', 'e => e.classList.contains("reader-single-custom")')
    assert pg.locator('.scramble-page:visible').count() == 1
    assert pg.inner_text('#curPage') == '第 1 页'

    pg.keyboard.press('ArrowRight')
    assert pg.inner_text('#curPage') == '第 2 页'
    pg.keyboard.press('Home')
    assert pg.inner_text('#curPage') == '第 1 页'
    pg.keyboard.press('End')
    assert pg.inner_text('#curPage') == '第 5 页'

    pg.keyboard.press('?')
    assert pg.is_visible('#readerHelp.show')
    pg.keyboard.press('Escape')
    assert not pg.is_visible('#readerHelp.show')

    pg.keyboard.press('m')
    assert not pg.eval_on_selector('body', 'e => e.classList.contains("reader-single")')
    assert pg.evaluate("localStorage.getItem('jmv-reader-mode')") == 'scroll'
    pg.keyboard.press('m')
    assert pg.eval_on_selector('body', 'e => e.classList.contains("reader-single")')
    assert pg.evaluate("localStorage.getItem('jmv-reader-mode')") == 'single'
    assert pg.locator('.reader-tools-main').count() == 1
    assert pg.locator('.more-pop-head').inner_text().startswith('阅读设置')
    ctx.close()


def test_single_page_click_zones_and_input_guard(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'single',
        'jmv-single-fit': 'contain',
    })
    image = pg.locator('#page_0 .page-img')
    image.wait_for(state='visible')
    box = image.bounding_box()
    image.click(position={'x': box['width'] * 0.75, 'y': box['height'] / 2})
    pg.wait_for_timeout(300)
    assert pg.inner_text('#curPage') == '第 2 页'

    image = pg.locator('#page_1 .page-img')
    box = image.bounding_box()
    image.click(position={'x': box['width'] * 0.25, 'y': box['height'] / 2})
    pg.wait_for_timeout(300)
    assert pg.inner_text('#curPage') == '第 1 页'

    page = pg.locator('#page_0')
    page_box = page.bounding_box()
    page.click(position={'x': page_box['width'] - 5, 'y': page_box['height'] / 2})
    pg.wait_for_timeout(300)
    assert pg.inner_text('#curPage') == '第 2 页'

    page = pg.locator('#page_1')
    page_box = page.bounding_box()
    page.click(position={'x': 5, 'y': page_box['height'] / 2})
    pg.wait_for_timeout(300)
    assert pg.inner_text('#curPage') == '第 1 页'

    pg.focus('#jumpSelect')
    pg.keyboard.press('ArrowRight')
    assert pg.inner_text('#curPage') == '第 1 页'
    ctx.close()


def test_single_page_custom_size_persisted(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'single',
        'jmv-single-fit': 'contain',
    })
    pg.click('#tSize')
    pg.eval_on_selector(
        '#tSizeRange',
        "el => { el.value = '1200'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert pg.eval_on_selector('#stream', 'e => e.classList.contains("reader-single-custom")')
    assert pg.evaluate("localStorage.getItem('jmv-single-fit')") == 'custom'
    assert pg.evaluate("localStorage.getItem('jmv-img-custom-size')") == '1200'
    ctx.close()


# ---------- 项9：护眼滤镜 ----------
def test_eye_care(browser, live_server):
    pg = _open(browser.new_context(), live_server)
    has_eye = "() => document.getElementById('stream').classList.contains('eye-care')"
    assert pg.evaluate(has_eye) is False

    pg.click('#tEye')
    pg.wait_for_timeout(100)
    assert pg.evaluate(has_eye) is True, '点击后护眼 class 未生效'
    assert pg.evaluate("() => localStorage.getItem('jmv-eyecare')") == '1'

    pg.click('#tEye')
    pg.wait_for_timeout(100)
    assert pg.evaluate(has_eye) is False
    assert pg.evaluate("() => localStorage.getItem('jmv-eyecare')") == '0'
    pg.close()


# ---------- 项11：图片临时旋转 + 双击不误触工具栏 ----------
def test_image_rotate_and_toolbar(browser, live_server):
    pg = _open(browser.new_context(), live_server)
    # 让首图加载出来（懒加载）
    pg.eval_on_selector('#page_0', 'el => el.scrollIntoView()')
    pg.wait_for_timeout(300)

    # 双击第一张图 → transform 含 rotate
    pg.dblclick('#page_0 .page-img')
    pg.wait_for_timeout(200)
    transform = pg.eval_on_selector('#page_0 .page-img', 'el => el.style.transform')
    assert 'rotate' in transform, f'双击图片未旋转，transform={transform!r}'

    # 页面双击不再切换工具栏，避免连续点击控件时误触。
    before = pg.eval_on_selector('.r-tools', 'el => el.className')
    pg.dispatch_event('body', 'dblclick')
    pg.wait_for_timeout(150)
    after = pg.eval_on_selector('.r-tools', 'el => el.className')
    assert before == after, f'空白双击不应改变工具栏状态（{before!r} -> {after!r}）'

    # 桌面端右侧热区移入展开，移出后延迟收起。
    box = pg.locator('.r-tools').bounding_box()
    pg.mouse.move(pg.viewport_size['width'] - 2, box['y'] + box['height'] / 2)
    pg.wait_for_timeout(100)
    assert pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')

    # 阅读设置打开期间保持展开；连续点击进度条开关不会隐藏工具栏。
    pg.click('#tMore')
    progress_before = pg.eval_on_selector('#rBottom', 'el => el.classList.contains("hidden")')
    pg.dblclick('#tProg')
    assert pg.eval_on_selector('.r-tools', 'el => getComputedStyle(el).display') == 'block'
    assert pg.eval_on_selector('#rBottom', 'el => el.classList.contains("hidden")') == progress_before
    pg.keyboard.press('Escape')
    pg.mouse.move(80, 80)
    pg.wait_for_timeout(550)
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    pg.close()


def test_mobile_toolbar_is_touch_drawer(browser, live_server):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = _open(ctx, live_server)
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'false'

    pg.click('#toolsHandle')
    assert pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'true'

    pg.dispatch_event('body', 'click')
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'false'
    ctx.close()


# ---------- 进度条开关状态记忆 ----------

def test_progressbar_toggle_persisted(browser, live_server):
    ctx = browser.new_context()  # 同 context 共享 localStorage
    pg = _open(ctx, live_server)
    # 默认进度条可见（无 hidden），按钮激活
    assert not pg.eval_on_selector('#rBottom', 'e => e.classList.contains("hidden")')
    # 点开关 → 隐藏
    pg.click('#tProg')
    pg.wait_for_timeout(150)
    assert pg.eval_on_selector('#rBottom', 'e => e.classList.contains("hidden")'), '点击后应隐藏'
    assert pg.evaluate("() => localStorage.getItem('jmv-prog-hidden')") == '1'
    # 重开页面 → 恢复为隐藏
    pg2 = _open(ctx, live_server)
    pg2.wait_for_timeout(150)
    assert pg2.eval_on_selector('#rBottom', 'e => e.classList.contains("hidden")'), '进度条隐藏状态未记忆'
    assert not pg2.eval_on_selector('#tProg', 'e => e.classList.contains("active")'), '按钮应为非激活态'
    ctx.close()
