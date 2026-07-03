"""
看本阅读页（jm_view.html）5 个前端增强功能的 playwright 端到端验收。

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


# ---------- 项3：图片适配模式 ----------
def test_fit_modes(browser, live_server):
    pg = _open(browser.new_context(), live_server)

    def stream_fit():
        return pg.evaluate(
            "() => { var s=document.getElementById('stream');"
            "return ['fit-width','fit-height','fit-raw'].find(c=>s.classList.contains(c)); }")

    # 默认适宽
    assert stream_fit() == 'fit-width'
    # 循环切换：width -> height -> raw -> width
    expected = ['fit-height', 'fit-raw', 'fit-width']
    for exp in expected:
        pg.click('#tFit')
        pg.wait_for_timeout(100)
        assert stream_fit() == exp, f'切换后应为 {exp}，实际 {stream_fit()}'
        assert pg.evaluate("() => localStorage.getItem('jmv-fit')") == exp
    pg.close()


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


# ---------- 项11：图片临时旋转 + 空白双击仍切换工具栏 ----------
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

    # 空白处（工具栏本身之外、图片之外）双击仍切换工具栏显隐。
    # 用 reader-top 标题区作为“非图片”双击目标。
    before = pg.eval_on_selector('.r-tools', 'el => el.style.display')
    pg.dblclick('.reader-top')
    pg.wait_for_timeout(150)
    after = pg.eval_on_selector('.r-tools', 'el => el.style.display')
    assert before != after, f'空白双击未切换工具栏显隐（{before!r} -> {after!r}）'
    pg.close()


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
    assert pg.evaluate("() => localStorage.getItem('jmv-progressbar')") == '0'
    # 重开页面 → 恢复为隐藏
    pg2 = _open(ctx, live_server)
    pg2.wait_for_timeout(150)
    assert pg2.eval_on_selector('#rBottom', 'e => e.classList.contains("hidden")'), '进度条隐藏状态未记忆'
    assert not pg2.eval_on_selector('#tProg', 'e => e.classList.contains("active")'), '按钮应为非激活态'
    ctx.close()
