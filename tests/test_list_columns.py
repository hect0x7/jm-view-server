"""
列表视图列宽/操作/文件名 验收：
  B  文件名列多行截断（line-clamp:3 + max-width）
  C  表头列右边界拖拽调宽 + localStorage 记忆
  D  删除 / 在文件管理器中显示 收进操作 ⋯ 菜单（删除保留二次确认）
"""


def _open(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('.file-item')
    return pg


# ---------- B：文件名多行 ----------

def test_filename_multiline(live_server, browser):
    pg = _open(live_server, browser)
    clamp = pg.eval_on_selector('.list-view .file-link',
                                'e => getComputedStyle(e).webkitLineClamp')
    mw = pg.eval_on_selector('.list-view .file-link', 'e => getComputedStyle(e).maxWidth')
    assert clamp.strip() == '3', f'文件名应最多3行，实际 {clamp!r}'
    assert mw and mw != 'none', f'文件名列应设最大宽度，实际 {mw!r}'


# ---------- D：删除 / 在...显示 进入 ⋯ ----------

def test_delete_and_reveal_in_more_menu(live_server, browser):
    pg = _open(live_server, browser)
    labels = pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col').innerText.includes('漫画B'));
            return [...row.querySelectorAll('.more-dropdown .more-item')].map(a => a.textContent.trim());
        }""")
    assert any('删除' in l for l in labels), f'⋯ 里应有删除: {labels}'
    assert any('显示' in l for l in labels), f'⋯ 里应有“在…中显示”: {labels}'
    # 大小列不再有常驻删除按钮
    has_del_btn = pg.eval_on_selector_all('.list-view .size-col .delete-btn', 'els => els.length')
    assert has_del_btn == 0, '大小列不应再有删除按钮（已移入 ⋯）'


def test_delete_keeps_confirm(live_server, browser):
    """点 ⋯ 里的删除会弹二次确认；取消则不删。"""
    pg = _open(live_server, browser)
    # 取消 confirm
    pg.on('dialog', lambda d: d.dismiss())
    # 打开漫画A行的 ⋯ 菜单并点删除
    clicked = pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col').innerText.includes('漫画A'));
            row.querySelector('.more-btn').click();
            const del = [...row.querySelectorAll('.more-item')].find(a => a.textContent.includes('删除'));
            del.click();
            return true;
        }""")
    assert clicked
    pg.wait_for_timeout(400)
    # 取消后漫画A仍在
    still = pg.eval_on_selector_all('.list-view .file-item',
        'items => items.some(el => el.querySelector(".file-name-col").innerText.includes("漫画A"))')
    assert still, '取消确认后不应删除'


# ---------- C：列宽拖拽 + 记忆 ----------

def test_column_resize_persisted(live_server, browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('.col-resizer')
    # 拖动“大小”列右边界的手柄（data-col=size）向右 60px
    handle = pg.query_selector('.col-resizer[data-col="size"]')
    box = handle.bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.mouse.down()
    pg.mouse.move(box['x'] + 60, box['y'] + box['height'] / 2, steps=5)
    pg.mouse.up()
    pg.wait_for_timeout(200)
    # localStorage 记录了列宽
    cols = pg.evaluate("() => localStorage.getItem('jmv-cols')")
    assert cols and 'size' in cols, f'列宽未记忆: {cols}'
    w1 = pg.eval_on_selector('.list-view', "e => e.style.getPropertyValue('--col-size')")
    assert w1, '列宽变量未设置'
    # 刷新后列宽恢复
    pg.reload()
    pg.wait_for_selector('.list-view')
    pg.wait_for_timeout(200)
    w2 = pg.eval_on_selector('.list-view', "e => e.style.getPropertyValue('--col-size')")
    assert w2 == w1, f'刷新后列宽未恢复: {w1!r} -> {w2!r}'
    ctx.close()
