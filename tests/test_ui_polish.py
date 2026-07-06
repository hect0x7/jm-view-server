"""
UI 改进 3 项验收（todo.md）：
  #1 操作列折叠“更多操作”下拉，只常驻看本
  #2 网格文件名两行截断（line-clamp:2）
  #3 上传页返回键字重加强
"""
import re


def _open_index(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('.file-item')
    return pg


# ---------- todo #1：更多操作下拉 ----------

def test_action_col_only_kanben_persistent(live_server, browser):
    """操作列常驻按钮只有“看本”（对含图片目录），打包/重命名/移动都在下拉里，默认隐藏。"""
    pg = _open_index(live_server, browser)
    # 找“漫画B”行（图直接在其下 → jm_view=True，有看本；漫画A 图在 images 子目录本层无图）
    html = pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col').innerText.includes('漫画B'));
            return row ? row.querySelector('.file-action-col').outerHTML : '';
        }""")
    assert '看本' in html, '看本应常驻'
    assert 'more-menu' in html and 'more-btn' in html, '应有更多操作按钮'
    # 下拉项存在于 DOM
    assert '重命名' in html and '移动' in html, '下拉应含重命名/移动'
    # 下拉默认不可见
    visible = pg.eval_on_selector_all(
        '.list-view .file-item .more-dropdown',
        'els => els.some(e => getComputedStyle(e).display !== "none")')
    assert visible is False, '下拉默认应隐藏'


def test_more_menu_toggle(live_server, browser):
    """点“更多”按钮展开下拉，再点外部收起。"""
    pg = _open_index(live_server, browser)
    # 点第一个 more-btn
    pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.more-btn'));
            row.querySelector('.more-btn').click();
        }""")
    pg.wait_for_selector('.more-menu.open')
    assert pg.locator('.more-menu.open').count() == 1, '应有且仅一个菜单展开'
    # 展开的下拉可见
    vis = pg.eval_on_selector('.more-menu.open .more-dropdown',
                              'e => getComputedStyle(e).display !== "none"')
    assert vis is True
    # 点页面空白收起
    pg.click('body', position={'x': 5, 'y': 5})
    pg.wait_for_selector('.more-menu.open', state='detached', timeout=3000) if False else pg.wait_for_timeout(300)
    assert pg.locator('.more-menu.open').count() == 0, '点外部应收起'


def test_more_menu_download_only_for_image_dir(live_server, browser):
    """打包下载只在“含图片的目录”出现；空文件夹（jm_view=False）无看本、无打包下载，仍可重命名/移动。"""
    pg = _open_index(live_server, browser)
    # 取空文件夹行里实际的操作按钮文本（<a>/<button>），避免 HTML 注释干扰断言
    labels = pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col').innerText.includes('空文件夹'));
            if (!row) return null;
            return [...row.querySelectorAll('.file-action-col a, .file-action-col button')]
                     .map(a => (a.textContent || '').trim());
        }""")
    assert labels is not None, '应找到空文件夹行'
    text = ' '.join(labels)
    assert '打包下载' not in text, f'无图目录不应有打包下载: {labels}'
    assert '看本' not in text, f'无图目录不应有看本: {labels}'
    assert any('重命名' in l for l in labels) and any('移动' in l for l in labels), \
        f'仍可重命名/移动: {labels}'


def test_no_kanben_for_plain_file(live_server, browser):
    """非目录文件（readme.txt / cover.jpg）不应出现看本按钮，即便所在目录含图片。"""
    pg = _open_index(live_server, browser)
    for fname in ('readme.txt', 'cover.jpg'):
        labels = pg.eval_on_selector_all(
            '.list-view .file-item',
            """(items, fname) => {
                const row = items.find(el => el.querySelector('.file-name-col').innerText.includes(fname));
                if (!row) return null;
                return [...row.querySelectorAll('.file-action-col a, .file-action-col button')]
                         .map(a => (a.textContent || '').trim());
            }""", fname)
        assert labels is not None, f'应找到 {fname} 行'
        assert not any('看本' in l for l in labels), f'{fname}(文件) 不应有看本: {labels}'


# ---------- todo #2：网格文件名两行截断 ----------

def test_grid_name_single_line(live_server, browser):
    """网格文件名单行截断（nowrap+省略号），卡片整齐一致。"""
    pg = _open_index(live_server, browser)
    pg.click('#segGrid')
    pg.wait_for_timeout(200)
    ws = pg.eval_on_selector('.grid-view .card-meta .name', 'e => getComputedStyle(e).whiteSpace')
    ov = pg.eval_on_selector('.grid-view .card-meta .name', 'e => getComputedStyle(e).textOverflow')
    assert ws == 'nowrap', f'网格名应单行 nowrap，实际 {ws!r}'
    assert ov == 'ellipsis', f'网格名应省略号，实际 {ov!r}'


# ---------- 看本按钮横排（不被窄列挤成竖排） ----------

def test_action_btn_horizontal(live_server, browser):
    pg = _open_index(live_server, browser)
    box = pg.eval_on_selector(
        '.list-view .action-btn',
        'e => { const r = e.getBoundingClientRect(); return {w: r.width, h: r.height}; }')
    assert box['w'] > box['h'], f'看本按钮应横排(宽>高)，实际 {box}'


# ---------- 视图选择记忆（列表/网格） ----------

def test_view_mode_persisted(live_server, browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('#seg')
    pg.click('#segGrid')
    pg.wait_for_timeout(150)
    assert pg.eval_on_selector('#app', 'e => e.classList.contains("grid-mode")')
    # 刷新后仍是网格
    pg.reload()
    pg.wait_for_selector('#seg')
    pg.wait_for_timeout(150)
    assert pg.eval_on_selector('#app', 'e => e.classList.contains("grid-mode")'), '视图选择未记忆'
    assert pg.eval_on_selector('#segGrid', 'e => e.classList.contains("on")'), '段控件高亮未恢复'
    ctx.close()


# ---------- todo #3：上传页返回键字重 ----------

def test_upload_back_button_weight(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/upload_file')
    pg.wait_for_selector('a.btn-ghost')
    weight = pg.eval_on_selector(
        'a.btn-ghost', 'e => getComputedStyle(e).fontWeight')
    # 600 或浏览器归一化后的数值
    assert str(weight) in ('600', 'bold'), f'返回键字重应加强为 600，实际 {weight!r}'
