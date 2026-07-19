"""
看本阅读页（jm_view.html）前端增强功能的 playwright 端到端验收。

复用 conftest.py 的 live_server（无密码 JmServer + 测试数据目录，漫画A 有 5 图）
和 browser（headless chromium，无 pytest-playwright 插件，用 browser.new_page()）。

看本 URL：live_server.url + '/jm_view?path=<漫画A绝对路径>&openFromDir=<父目录>'
（app.py 的 jm_view 路由参数名 path / openFromDir，title 取文件夹名“漫画A”）
"""
import os
from pathlib import Path
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


def _set_page_types(pg, wide_indexes=()):
    """等待 fixture 图片加载后，通过阅读器公开的页面类型状态重建双页编组。"""
    pg.click('#loadAll')
    pg.wait_for_function(
        '() => Array.from(document.querySelectorAll(".page-img"))'
        '.every(image => image.complete && image.naturalHeight > 0)')
    pg.evaluate(
        """wideIndexes => {
            const wide = new Set(wideIndexes);
            document.querySelectorAll('.page-img').forEach((image, index) => {
                image.dataset.readerWide = wide.has(index) ? '1' : '0';
            });
            rebuildDoubleGroups(activePageIndex);
        }""",
        list(wide_indexes),
    )


def test_double_width_scale_static_contract():
    root = Path(__file__).resolve().parents[1]
    app_js = (root / 'src/jm_view_server/static/js/app.js').read_text(encoding='utf-8')
    reader_js = (root / 'src/jm_view_server/static/js/reader.js').read_text(encoding='utf-8')
    reader_css = (root / 'src/jm_view_server/static/css/reader.css').read_text(encoding='utf-8')
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')
    settings_html = (root / 'src/jm_view_server/templates/settings.html').read_text(encoding='utf-8')

    assert "doubleWidthScale: { key: 'jmv-double-width-scale', type: 'number', min: 50, max: 100, fallback: 98 }" in app_js
    assert 'id="doubleWidthScale"' in settings_html
    assert 'id="doubleWidthScaleRange"' in reader_html
    assert 'min="50" max="100" step="1" value="98"' in settings_html
    assert 'min="50" max="100" step="1" value="98"' in reader_html
    assert '双页画面比例' in settings_html
    assert '<span>画面比例</span>' in reader_html
    assert "if (isNaN(numberValue)) return def.fallback;" in app_js
    assert "Math.max(50, Math.min(100, percentage)) + '%'" in app_js
    assert 'parseInt(value, 10) || def.fallback' not in app_js
    assert 'formatDoubleWidthScale(doubleWidthScale.value)' in (
        root / 'src/jm_view_server/static/js/settings.js').read_text(encoding='utf-8')
    assert 'formatDoubleWidthScale(doubleWidthScale)' in reader_js
    assert 'var breathingRoom = 100 - doubleWidthScale;' in reader_js
    assert "stream.style.setProperty('--reader-double-width-scale', String(doubleWidthScale))" in reader_js
    assert "stream.style.setProperty('--reader-double-width-breathing-inline', (breathingRoom / 2) + 'vw')" in reader_js
    assert "stream.style.setProperty('--reader-double-width-breathing-block', (breathingRoom / 2) + 'vh')" in reader_js
    assert "applyDoubleWidthScale(98, true)" in reader_js
    assert "e.detail.name === 'doubleWidthScale'" in reader_js
    assert 'padding: var(--reader-double-width-breathing-block) var(--reader-double-width-breathing-inline) calc(120px + var(--reader-double-width-breathing-block));' in reader_css
    assert 'padding: var(--reader-double-width-breathing-block) var(--reader-double-width-breathing-inline) calc(96px + var(--reader-double-width-breathing-block));' in reader_css
    assert '--reader-double-column-gap: 0px;' in reader_css
    assert '--reader-double-row-gap: 0px;' in reader_css
    assert 'bindRangeValueFeedback' not in app_js
    assert 'bindRangeValueFeedback' not in reader_js
    assert 'settings-scale-control' not in settings_html
    assert '.reader-double-scale-control.is-adjusting output' not in reader_css
    assert '.reader-double-scale-control input {' in reader_css
    assert 'height: 20px' in reader_css
    assert "document.body.classList.toggle('reader-double', readerMode === 'double')" in reader_js
    assert "stream.classList.toggle('reader-double-mode', readerMode === 'double')" in reader_js
    assert 'effectiveDoubleFit' not in reader_js
    assert 'jmv-double-fit' not in reader_js
    assert "stream.style.gridAutoRows = 'auto';" in reader_js
    final_mode_init = "setReaderMode(readerMode, { persist: false, initial: true });"
    assert reader_js.count(final_mode_init) == 1
    assert reader_js.rfind(final_mode_init) > reader_js.find("var stream = document.getElementById('stream');")
    assert reader_js.rfind(final_mode_init) < reader_js.rfind('updateDocumentScrollProgress(false);')


def test_toolbar_pinned_static_contract():
    root = Path(__file__).resolve().parents[1]
    reader_js = (root / 'src/jm_view_server/static/js/reader.js').read_text(encoding='utf-8')
    reader_css = (root / 'src/jm_view_server/static/css/reader.css').read_text(encoding='utf-8')
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')

    assert 'id="toolsHandle"' in reader_html
    assert 'aria-pressed="false"' in reader_html
    assert 'toolbarPinned = desktopToolbarQuery.matches && !!pinned;' in reader_js
    assert "toolsHandle.setAttribute('aria-pressed', toolbarPinned ? 'true' : 'false');" in reader_js
    assert 'setToolbarPinned(false, false);' in reader_js
    assert '.reader-tools-handle:focus-visible {' in reader_css
    assert 'outline: 3px solid var(--brand-ring);' in reader_css
    assert '.r-tools.is-pinned .reader-tools-handle,' in reader_css
    assert 'opacity: 1; color: #fff; background: var(--brand);' in reader_css
    assert '.r-tools.is-pinned .reader-tools-handle i { opacity: 1; }' in reader_css
    assert '.r-tools.is-pinned .reader-tools-main {' in reader_css
    assert '.reader-tools-handle i, .reader-tools-handle::after, .reader-scroll-progress { transition: none; }' in reader_css


def test_settings_transaction_replacement_static_contract():
    root = Path(__file__).resolve().parents[1]
    settings_js = (
        root / 'src/jm_view_server/static/js/settings.js').read_text(encoding='utf-8')

    assert 'function cancel() {' in settings_js
    assert 'function cleanup() {' in settings_js
    assert 'restoreAnchor();\n      cancel();' in settings_js
    assert settings_js.count('if (activeTransaction) activeTransaction.cancel();') >= 2
    assert 'if (activeTransaction) activeTransaction.cleanup();' not in settings_js
    assert "scrollHost.addEventListener('wheel', cancelActiveTransaction, true);" in settings_js
    assert "scrollHost.addEventListener('touchstart', cancelActiveTransaction, true);" in settings_js


def test_reader_document_scroll_feedback_static_contract():
    root = Path(__file__).resolve().parents[1]
    reader_js = (root / 'src/jm_view_server/static/js/reader.js').read_text(encoding='utf-8')
    reader_css = (root / 'src/jm_view_server/static/css/reader.css').read_text(encoding='utf-8')
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')

    assert 'id="readerScrollProgress"' in reader_html
    assert 'pointer-events: none' in reader_css
    assert '@media (min-width: 861px)' in reader_css
    assert 'html::-webkit-scrollbar { width: 16px; }' in reader_css
    assert 'html::-webkit-scrollbar-thumb:hover' in reader_css
    assert 'html::-webkit-scrollbar-thumb:active' in reader_css
    assert 'scrollbar-color:' in reader_css
    assert 'scrollbar-width: auto' in reader_css
    assert '.reader-eye-care .reader-scroll-progress' in reader_css
    assert 'window.scrollY / maxScroll' in reader_js
    assert 'var maxScroll = scrollHeight - window.innerHeight;' in reader_js
    assert "scrollProgressIndicator.classList.add('is-visible')" in reader_js
    assert "scrollProgressIndicator.classList.remove('is-visible')" in reader_js
    assert 'function hideDocumentScrollProgress()' in reader_js
    assert 'var scrollbarDragPointerId = null;' in reader_js
    assert 'function canShowDocumentScrollProgress()' in reader_js
    assert "if (!scrollProgressIndicator || readerMode === 'single' || !desktopToolbarQuery.matches) return false;" in reader_js
    assert 'document.documentElement.scrollHeight - window.innerHeight > 1' in reader_js
    assert 'function isNativeScrollbarThumbPointerDown(e)' in reader_js
    assert "if (!e.isPrimary || e.pointerType !== 'mouse' || e.button !== 0) return false;" in reader_js
    assert 'e.target !== document.documentElement' in reader_js
    assert 'e.clientX < document.documentElement.clientWidth' in reader_js
    assert 'Math.max(52, viewportHeight * viewportHeight / scrollHeight)' in reader_js
    assert 'e.clientY >= thumbTop && e.clientY <= thumbTop + thumbHeight' in reader_js
    assert "document.documentElement.addEventListener('pointerdown'" in reader_js
    assert "window.addEventListener('pointerup'" in reader_js
    assert "window.addEventListener('pointercancel'" in reader_js
    assert "window.addEventListener('blur', hideDocumentScrollProgress);" in reader_js
    assert 'updateDocumentScrollProgress(scrollbarDragPointerId !== null);' in reader_js
    assert reader_js.count('updateDocumentScrollProgress(true);') == 1
    assert 'scrollProgressHideTimer' not in reader_js
    assert "if (maxScroll <= 1)" in reader_js
    assert reader_js.count('updateDocumentScrollProgress(false);') >= 2
    assert "document.body.classList.toggle('reader-eye-care', !!on)" in reader_js


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


def test_resume_bar_auto_dismisses(browser, live_server):
    ctx = browser.new_context()
    pg = _open(ctx, live_server)
    pg.evaluate("() => localStorage.setItem('jmv-progress:images', '3')")
    pg.close()
    pg2 = _open(ctx, live_server)
    pg2.wait_for_selector('.resume-bar.show', timeout=3000)
    pg2.wait_for_selector('.resume-bar', state='detached', timeout=6000)
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
    pg.keyboard.press('ArrowLeft')
    assert pg.inner_text('#curPage') == '第 1 页'
    pg.keyboard.press('Home')
    assert pg.inner_text('#curPage') == '第 1 页'
    pg.keyboard.press('End')
    assert pg.inner_text('#curPage') == '第 5 页'

    pg.keyboard.press('?')
    assert pg.is_visible('#readerHelp.show')
    pg.keyboard.press('Escape')
    assert not pg.is_visible('#readerHelp.show')

    pg.keyboard.press('m')
    assert pg.eval_on_selector('body', 'e => e.classList.contains("reader-double")')
    assert pg.evaluate("localStorage.getItem('jmv-reader-mode')") == 'double'
    pg.keyboard.press('m')
    assert not pg.eval_on_selector('body', 'e => e.classList.contains("reader-double")')
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
    assert pg.eval_on_selector('#tSizeRange', 'range => range.getBoundingClientRect().height') >= 18
    pg.click('#tSize')
    pg.eval_on_selector(
        '#tSizeRange',
        "el => { el.value = '1200'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert pg.eval_on_selector('#stream', 'e => e.classList.contains("reader-single-custom")')
    assert pg.evaluate("localStorage.getItem('jmv-single-fit')") == 'custom'
    assert pg.evaluate("localStorage.getItem('jmv-img-custom-size')") == '1200'
    ctx.close()


# ---------- 连续下拉双页、阅读方向与缩略图总览 ----------
def test_double_mode_vertical_groups_cover_pairs_wide_and_tail_blank(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
        'jmv-reading-direction': 'ltr',
    })
    _set_page_types(pg, wide_indexes=(3,))

    assert pg.eval_on_selector('body', 'e => e.classList.contains("reader-double")')
    assert pg.eval_on_selector('#stream', 'e => e.classList.contains("reader-double-mode")')
    assert pg.get_attribute('body', 'data-reading-direction') == 'ltr'
    assert pg.evaluate("localStorage.getItem('jmv-reader-mode')") == 'double'
    assert pg.evaluate('isPagedMode()') is False
    seamless = pg.eval_on_selector('#stream', """stream => {
        const style = getComputedStyle(stream);
        const pageStyle = getComputedStyle(document.getElementById('page_1'));
        const imageStyle = getComputedStyle(document.querySelector('#page_1 .page-img'));
        return {
            columnGap: style.columnGap,
            rowGap: style.rowGap,
            paddingTop: style.paddingTop,
            paddingLeft: style.paddingLeft,
            pageBackground: pageStyle.backgroundColor,
            imageShadow: imageStyle.boxShadow,
        };
    }""")
    assert seamless == {
        'columnGap': '0px',
        'rowGap': '0px',
        'paddingTop': '0px',
        'paddingLeft': '0px',
        'pageBackground': 'rgba(0, 0, 0, 0)',
        'imageShadow': 'none',
    }

    layout = pg.evaluate("""() => Array.from(document.querySelectorAll('.scramble-page')).map(page => {
        const style = getComputedStyle(page);
        return {
            display: style.display,
            row: style.getPropertyValue('--reader-double-row').trim(),
            columnStart: style.gridColumnStart,
            columnEnd: style.gridColumnEnd,
        };
    })""")
    assert all(page['display'] != 'none' for page in layout)
    assert all(page['row'] for page in layout)
    assert len({layout[index]['row'] for index in (0, 1, 3, 4)}) == 4

    assert pg.locator('#page_0.is-double-cover.is-double-right').count() == 1
    assert pg.evaluate('doubleGroups[0].slots') == [None, 0]
    assert layout[1]['row'] == layout[2]['row']
    assert layout[1]['columnStart'] != layout[2]['columnStart']
    assert pg.locator('#page_1.is-double-left').count() == 1
    assert pg.locator('#page_2.is-double-right').count() == 1
    assert pg.locator('#page_3.is-double-wide').count() == 1
    assert layout[3]['columnStart'] != layout[3]['columnEnd']
    assert pg.locator('#page_4.is-double-left').count() == 1
    assert pg.evaluate('doubleGroups[doubleGroups.length - 1].slots') == [4, None]

    pg.evaluate('gotoPage(2)')
    pg.wait_for_function(
        """() => {
            const rect = document.getElementById('page_1').getBoundingClientRect();
            return activeDoubleGroupIndex === 1 && rect.bottom > 0 && rect.top < innerHeight;
        }""")
    assert pg.inner_text('#curPage') == '第 3 页'

    pg.select_option('#jumpSelect', '4')
    pg.wait_for_function(
        """() => {
            const rect = document.getElementById('page_4').getBoundingClientRect();
            return activeDoubleGroupIndex === doubleGroups.length - 1 &&
                rect.bottom > 0 && rect.top < innerHeight;
        }""")
    assert pg.inner_text('#curPage') == '第 5 页'
    ctx.close()


def test_reading_direction_only_reorders_double_page_slots(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
        'jmv-reading-direction': 'rtl',
    })
    _set_page_types(pg)

    assert pg.get_attribute('body', 'data-reading-direction') == 'rtl'
    assert pg.get_attribute('#stream', 'data-reading-direction') == 'rtl'
    assert pg.evaluate('doubleGroups[1].anchor') == 1
    assert pg.locator('#page_1.is-double-right').count() == 1
    assert pg.locator('#page_2.is-double-left').count() == 1
    assert pg.eval_on_selector('#page_1', 'page => getComputedStyle(page).gridColumnStart') == '2'
    assert pg.eval_on_selector('#page_2', 'page => getComputedStyle(page).gridColumnStart') == '1'

    pg.evaluate('gotoPage(2)')
    pg.wait_for_function('() => activeDoubleGroupIndex === 1')
    assert pg.inner_text('#curPage') == '第 3 页'
    ctx.close()


def test_double_mode_horizontal_input_does_not_turn_and_vertical_keys_scroll(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
        'jmv-reading-direction': 'ltr',
    })
    _set_page_types(pg, wide_indexes=(3,))

    before = pg.evaluate("""() => ({
        page: document.getElementById('curPage').textContent,
        group: activeDoubleGroupIndex,
        y: scrollY,
    })""")
    pg.dispatch_event('#stream', 'click', {'clientX': 10, 'clientY': 10})
    pg.wait_for_timeout(300)
    after = pg.evaluate("""() => ({
        page: document.getElementById('curPage').textContent,
        group: activeDoubleGroupIndex,
        y: scrollY,
    })""")
    assert after['page'] == before['page']
    assert after['group'] == before['group']
    assert abs(after['y'] - before['y']) < 4

    pg.evaluate("""() => {
        window.__doubleKeyEvents = [];
        document.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(event.key)) return;
            setTimeout(() => window.__doubleKeyEvents.push({
                key: event.key,
                defaultPrevented: event.defaultPrevented,
            }), 0);
        });
    }""")

    pg.keyboard.press('ArrowLeft')
    pg.keyboard.press('ArrowRight')
    assert pg.evaluate('activeDoubleGroupIndex') == before['group']
    assert pg.inner_text('#curPage') == before['page']

    pg.evaluate('window.scrollTo(0, 0)')
    pg.keyboard.press('ArrowDown')
    pg.wait_for_function('() => window.__doubleKeyEvents.length >= 3 && window.scrollY > 0')
    arrow_down_y = pg.evaluate('window.scrollY')

    pg.keyboard.press('PageDown')
    pg.wait_for_function('previous => window.scrollY > previous', arrow_down_y)
    page_down_y = pg.evaluate('window.scrollY')

    pg.keyboard.press('Space')
    pg.wait_for_function('previous => window.scrollY > previous', page_down_y)
    space_y = pg.evaluate('window.scrollY')

    pg.keyboard.press('ArrowUp')
    pg.wait_for_function('previous => window.scrollY < previous', space_y)
    arrow_up_y = pg.evaluate('window.scrollY')

    pg.keyboard.press('PageUp')
    pg.wait_for_function('previous => window.scrollY < previous', arrow_up_y)

    pg.wait_for_function('() => window.__doubleKeyEvents.length === 7')
    key_events = pg.evaluate('window.__doubleKeyEvents')
    assert [event['key'] for event in key_events] == [
        'ArrowLeft', 'ArrowRight', 'ArrowDown', 'PageDown', ' ', 'ArrowUp', 'PageUp']
    assert all(event['defaultPrevented'] is False for event in key_events)
    ctx.close()


def test_double_mode_under_720px_uses_single_column_and_hides_blank_slots(browser, live_server):
    ctx = browser.new_context(viewport={'width': 719, 'height': 900})
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
        'jmv-reading-direction': 'rtl',
    })
    _set_page_types(pg, wide_indexes=(3,))

    page_layout = pg.evaluate("""() => Array.from(document.querySelectorAll('.scramble-page')).map(page => {
        const style = getComputedStyle(page);
        return { display: style.display, columnStart: style.gridColumnStart };
    })""")
    assert all(page['display'] != 'none' for page in page_layout)
    assert all(page['columnStart'] == '1' for page in page_layout)

    blank_slots = pg.locator('#stream > .reader-double-blank, #stream > .reader-double-slot.is-blank')
    assert blank_slots.count() == 2
    assert blank_slots.evaluate_all(
        "slots => slots.every(slot => getComputedStyle(slot).display === 'none')")
    assert pg.eval_on_selector(
        '#page_0 .page-img', 'image => getComputedStyle(image).maxHeight') == 'none'
    assert pg.is_hidden('#tSizeVal')
    assert pg.is_visible('#doubleWidthScaleControl')
    ctx.close()


def test_double_mode_uses_continuous_width_scale_and_reset(browser, live_server):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
        'jmv-double-width-scale': '80',
    })
    _set_page_types(pg)

    assert pg.is_hidden('#sizeRangeControl')
    assert pg.is_visible('#doubleWidthScaleControl')
    assert pg.is_hidden('#tSizeVal')
    assert pg.eval_on_selector(
        '#page_1 .page-img', 'image => getComputedStyle(image).maxHeight') == 'none'
    assert pg.input_value('#doubleWidthScaleRange') == '80'
    assert pg.inner_text('#doubleWidthScaleValue') == '80%'

    pg.evaluate("localStorage.setItem('jmv-single-fit', 'custom')")
    pg.evaluate("localStorage.setItem('jmv-img-custom-size', '320')")
    pg.reload()
    _set_page_types(pg)
    image_width, page_width = pg.eval_on_selector(
        '#page_1',
        "page => [page.querySelector('.page-img').getBoundingClientRect().width, page.getBoundingClientRect().width]",
    )
    assert abs(image_width - page_width) < 2

    pg.click('#tSizeReset', force=True)
    assert pg.evaluate("localStorage.getItem('jmv-double-width-scale')") == '98'
    assert pg.input_value('#doubleWidthScaleRange') == '98'
    assert pg.inner_text('#doubleWidthScaleValue') == '98%'
    ctx.close()


def test_double_mode_jump_keeps_requested_page_inside_pair(browser, live_server):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'double',
    })
    _set_page_types(pg)

    pg.evaluate('gotoPage(2)')
    pg.wait_for_timeout(800)
    assert pg.inner_text('#curPage') == '第 3 页'
    pg.click('#tGrid', force=True)
    assert pg.locator('#readerGrid [data-reader-page="2"].is-current').count() == 1
    assert pg.locator('#page_1.is-double-current').count() == 1
    assert pg.locator('#page_2.is-double-current').count() == 1
    ctx.close()


def test_thumbnail_grid_opens_and_jumps_to_page(browser, live_server):
    ctx = browser.new_context()
    pg = _open_with_preferences(ctx, live_server, {
        'jmv-reader-mode': 'single',
    })

    pg.click('#tGrid', force=True)
    assert pg.locator('#readerGridOverlay.show').count() == 1
    assert pg.get_attribute('#readerGridOverlay', 'aria-hidden') == 'false'
    assert pg.locator('#readerGrid .reader-grid-item').count() == 5
    assert pg.locator('#readerGrid [data-reader-page="0"].is-current').count() == 1

    pg.click('#readerGrid [data-reader-page="2"]')
    assert pg.inner_text('#curPage') == '第 3 页'
    assert pg.locator('#page_2.is-active').count() == 1
    assert pg.locator('#readerGridOverlay.show').count() == 0
    assert pg.get_attribute('#readerGridOverlay', 'aria-hidden') == 'true'
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


# ---------- 项11：图片长按径向旋转 + 双击不误触工具栏 ----------
def test_image_rotate_and_toolbar(browser, live_server):
    pg = _open(browser.new_context(), live_server)
    # 让首图加载出来（懒加载）
    pg.eval_on_selector('#page_0', 'el => el.scrollIntoView()')
    pg.wait_for_timeout(300)

    # 双击与右键不再旋转图片。
    pg.dblclick('#page_0 .page-img')
    pg.dispatch_event('#page_0 .page-img', 'contextmenu')
    assert pg.eval_on_selector('#page_0 .page-img', 'el => el.style.transform') == ''

    # 鼠标按住后出现四扇区菜单，选择 90° 才旋转。
    image_box = pg.locator('#page_0 .page-img').bounding_box()
    pg.mouse.move(image_box['x'] + image_box['width'] / 2, image_box['y'] + image_box['height'] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(650)
    assert pg.is_visible('#rotateRadial.show')
    assert pg.locator('#rotateRadial [data-rotate]').count() == 4
    pg.mouse.up()
    pg.click('#rotateRadial [data-rotate="90"]')
    assert pg.eval_on_selector('#page_0 .page-img', 'el => el.style.transform') == 'rotate(90deg)'
    assert not pg.is_visible('#rotateRadial')

    # 再次长按打开后，点击其他区域关闭。
    pg.mouse.move(image_box['x'] + image_box['width'] / 2, image_box['y'] + image_box['height'] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(650)
    pg.mouse.up()
    assert pg.is_visible('#rotateRadial.show')
    pg.mouse.click(20, pg.viewport_size['height'] / 2)
    assert not pg.is_visible('#rotateRadial')

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

    pg.click('#toolsHandle')
    assert pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-pinned")')
    assert pg.get_attribute('#toolsHandle', 'aria-pressed') == 'true'
    assert pg.eval_on_selector(
        '#toolsHandle',
        'el => !["transparent", "rgba(0, 0, 0, 0)"].includes(getComputedStyle(el).backgroundColor)',
    )
    pg.click('#toolsHandle')
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-pinned")')
    assert pg.get_attribute('#toolsHandle', 'aria-pressed') == 'false'

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


def test_reader_configuration_buttons_preserve_viewport(browser, live_server):
    pg = _open(browser.new_context(), live_server)
    pg.click('#loadAll')
    pg.wait_for_function(
        '() => Array.from(document.querySelectorAll(".page-img"))'
        '.every(image => image.complete && image.naturalHeight > 0)')
    pg.eval_on_selector('#page_2', 'element => element.scrollIntoView()')
    pg.wait_for_timeout(150)
    pg.click('#tMore')

    def assert_stable(action):
        before = pg.evaluate("""() => ({
            top: document.getElementById('page_2').getBoundingClientRect().top,
            page: document.getElementById('curPage').textContent
        })""")
        action()
        pg.wait_for_timeout(100)
        after = pg.evaluate("""() => ({
            top: document.getElementById('page_2').getBoundingClientRect().top,
            page: document.getElementById('curPage').textContent
        })""")
        assert abs(after['top'] - before['top']) <= 2
        assert after['page'] == before['page']

    assert pg.eval_on_selector('.reader-top', 'element => getComputedStyle(element).position') == 'fixed'
    assert_stable(lambda: pg.click('#tHead'))
    assert_stable(lambda: pg.click('#tProg'))
    assert_stable(lambda: pg.click('#tEye'))
    assert_stable(lambda: pg.click('#tAutoNext'))
    assert_stable(lambda: pg.click('#tSize'))
    assert_stable(lambda: pg.eval_on_selector(
        '#tSizeRange',
        "element => { element.value = '950'; element.dispatchEvent(new Event('input', { bubbles: true })); }",
    ))
    pg.close()


def test_mobile_toolbar_is_touch_drawer(browser, live_server):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = _open(ctx, live_server)
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'false'
    assert pg.get_attribute('#toolsHandle', 'aria-pressed') == 'false'
    assert pg.eval_on_selector('#toolsHandle', 'el => getComputedStyle(el, "::after").opacity') != '0'
    assert pg.eval_on_selector(
        '#toolsHandle',
        'el => !["transparent", "rgba(0, 0, 0, 0)"].includes(getComputedStyle(el, "::after").backgroundColor)',
    )

    pg.click('#toolsHandle')
    assert pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'true'
    assert pg.get_attribute('#toolsHandle', 'aria-pressed') == 'false'
    assert pg.eval_on_selector('#toolsHandle', 'el => getComputedStyle(el, "::before").content') in ('none', 'normal')
    assert pg.eval_on_selector('#toolsHandle', 'el => getComputedStyle(el, "::after").opacity') == '0'
    assert pg.locator('#toolsHandle i').evaluate_all(
        'dots => dots.every(dot => Number(getComputedStyle(dot).opacity) > 0)')

    pg.dispatch_event('body', 'click')
    assert not pg.eval_on_selector('.r-tools', 'el => el.classList.contains("is-open")')
    assert pg.get_attribute('#toolsHandle', 'aria-expanded') == 'false'
    assert pg.get_attribute('#toolsHandle', 'aria-pressed') == 'false'
    ctx.close()


# ---------- 进度条开关状态记忆 ----------

def test_progressbar_toggle_persisted(browser, live_server):
    ctx = browser.new_context()  # 同 context 共享 localStorage
    pg = _open(ctx, live_server)
    # 默认进度条可见（无 hidden），按钮激活
    assert not pg.eval_on_selector('#rBottom', 'e => e.classList.contains("hidden")')
    assert pg.eval_on_selector('#track', 'track => track.getBoundingClientRect().height') >= 10
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
