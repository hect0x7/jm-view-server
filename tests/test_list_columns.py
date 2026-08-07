"""
列表视图列宽/操作/文件名 验收：
  B  文件名列多行截断（line-clamp:3 + max-width）
  C  表头列右边界拖拽调宽 + localStorage 记忆
  D  删除 / 在文件管理器中显示 收进操作 ⋯ 菜单（删除保留二次确认）
"""
from urllib.parse import unquote


def _open(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.evaluate("localStorage.setItem('jmv-onboarding-settings-v1', '1')")
    pg.reload()
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


def test_delete_uses_site_confirm_modal(live_server, browser):
    """单删使用站内弹窗，支持焦点循环、Escape、遮罩取消和焦点返回。"""
    pg = _open(live_server, browser)
    native_dialogs = []
    pg.on('dialog', lambda dialog: (native_dialogs.append(dialog.type), dialog.dismiss()))
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
    modal = pg.locator('#deleteConfirmOverlay.open')
    modal.wait_for(state='visible')
    assert native_dialogs == []
    assert modal.get_by_role('heading').inner_text() == '彻底删除此项目？'
    assert '漫画A' in pg.locator('#deleteConfirmMessage').inner_text()
    assert pg.evaluate('document.activeElement.id') == 'deleteConfirmCancel'
    pg.keyboard.press('Tab')
    assert pg.evaluate('document.activeElement.id') == 'deleteConfirmSubmit'
    pg.keyboard.press('Tab')
    assert pg.evaluate('document.activeElement.id') == 'deleteConfirmCancel'
    pg.keyboard.press('Escape')
    assert not pg.locator('#deleteConfirmOverlay').is_visible()
    assert pg.evaluate('document.activeElement.classList.contains("more-btn")')
    assert pg.locator('.more-btn:focus').is_visible()

    # 再次打开，点击遮罩同样只取消，不执行删除。
    pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col').innerText.includes('漫画A'));
            row.querySelector('.more-btn').click();
            [...row.querySelectorAll('.more-item')].find(a => a.textContent.includes('删除')).click();
        }""")
    modal.wait_for(state='visible')
    pg.locator('#deleteConfirmOverlay').click(position={'x': 4, 'y': 4})
    assert not pg.locator('#deleteConfirmOverlay').is_visible()
    # 取消后漫画A仍在
    still = pg.eval_on_selector_all('.list-view .file-item',
        'items => items.some(el => el.querySelector(".file-name-col").innerText.includes("漫画A"))')
    assert still, '取消确认后不应删除'


def test_batch_delete_uses_site_confirm_modal(live_server, browser):
    """批量删除复用站内弹窗，并显示选中数量。"""
    pg = _open(live_server, browser)
    native_dialogs = []
    pg.on('dialog', lambda dialog: (native_dialogs.append(dialog.type), dialog.dismiss()))
    pg.get_by_role('button', name='多选').click()
    pg.locator('.row-select').first.check()
    pg.get_by_role('button', name='批量删除').click()
    modal = pg.locator('#deleteConfirmOverlay.open')
    modal.wait_for(state='visible')
    assert native_dialogs == []
    assert pg.locator('#deleteConfirmTitle').inner_text() == '批量删除 1 个项目？'
    assert pg.locator('#deleteConfirmSubmit').inner_text() == '删除 1 项'
    pg.locator('#deleteConfirmCancel').click()


def test_select_mode_clicks_whole_item_but_keeps_actions(live_server, browser):
    """列表与网格普通区域可切换选择，链接/按钮/复选框仍优先。"""
    pg = _open(live_server, browser)
    pg.get_by_role('button', name='多选').click()
    row = pg.locator('.list-view .file-item').filter(has_text='漫画A')
    checkbox = row.locator('.row-select')

    row.locator('.date-col').click()
    assert checkbox.is_checked()
    assert 'is-selected' in (row.get_attribute('class') or '')
    assert pg.locator('#batchCount').inner_text() == '已选 1 项'

    row.locator('.date-col').click()
    assert not checkbox.is_checked()
    assert 'is-selected' not in (row.get_attribute('class') or '')

    row.locator('.more-btn').click()
    assert not checkbox.is_checked(), '更多操作按钮应优先，不应切换选择'
    assert 'open' in (row.locator('.more-menu').get_attribute('class') or '')

    pg.locator('body').click(position={'x': 4, 'y': 4})
    row.locator('.row-select').check()
    assert checkbox.is_checked()
    assert 'is-selected' in (row.get_attribute('class') or '')
    row.locator('.row-select').uncheck()
    assert not checkbox.is_checked()

    pg.evaluate(
        """() => {
          document.getElementById('pathForm').addEventListener(
            'submit', event => event.preventDefault(), {once: true});
        }""")
    before_url = pg.url
    row.locator('.file-link').click()
    assert pg.url == before_url
    assert pg.locator('#pathForm input[name="path"]').input_value().endswith('漫画A')
    assert not checkbox.is_checked(), '文件链接应优先，不应切换选择'

    pg.reload()
    pg.wait_for_selector('.grid-view .card-item', state='attached')
    pg.locator('#segGrid').click()
    pg.get_by_role('button', name='多选').click()
    card = pg.locator('.grid-view .card-item').filter(has_text='漫画A')
    card_checkbox = card.locator('.row-select')
    card.locator('.info').click()
    assert card_checkbox.is_checked()
    assert 'is-selected' in (card.get_attribute('class') or '')
    assert pg.locator('#batchCount').inner_text() == '已选 1 项'
    card.locator('.info').click()
    assert not card_checkbox.is_checked()

    card.hover()
    card.locator('.card-delete-btn').click()
    assert not card_checkbox.is_checked(), '删除按钮应优先，不应切换选择'
    pg.locator('#deleteConfirmOverlay.open').wait_for(state='visible')
    pg.locator('#deleteConfirmCancel').click()

    pg.get_by_role('button', name='多选').click()
    card.locator('.info').click()
    pg.wait_for_url('**/?path=*')
    assert unquote(pg.url).endswith('/漫画A')


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
