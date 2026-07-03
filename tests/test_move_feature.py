"""
移动到其它目录（功能 #7）端到端验收。
用 conftest 的 live_server + browser。测试目录根下有“漫画A”“漫画B”两个目录，
把“漫画B”移动进“漫画A”，验证浮层交互 + /api/move 生效。
"""
import os


def _open(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('.file-item')
    return pg


def test_move_overlay_opens_and_lists_targets(live_server, browser):
    pg = _open(live_server, browser)
    # 点“漫画B”行的移动按钮
    pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col')
                                            .innerText.includes('漫画B'));
            row.querySelector('a[onclick^="moveItem"]').click();
        }""",
    )
    pg.wait_for_selector('#moveOverlay.open')
    # 目标列表里应含“漫画A”（当前目录另一个子文件夹），且不含自身“漫画B”
    targets = pg.eval_on_selector_all(
        '#moveList .move-target .mt-name', 'els => els.map(e => e.innerText)')
    assert any('漫画A' in t for t in targets), f'目标缺漫画A: {targets}'
    assert not any(t.strip() == '漫画B' for t in targets), f'目标不应含自身: {targets}'


def test_move_executes(live_server, browser):
    pg = _open(live_server, browser)
    root = live_server.root
    assert os.path.isdir(os.path.join(root, '漫画B'))
    assert not os.path.isdir(os.path.join(root, '漫画A', '漫画B'))

    # 打开漫画B的移动浮层
    pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col')
                                            .innerText.includes('漫画B'));
            row.querySelector('a[onclick^="moveItem"]').click();
        }""",
    )
    pg.wait_for_selector('#moveOverlay.open')
    # 点选“漫画A”作为目标
    pg.eval_on_selector_all(
        '#moveList .move-target',
        """rows => {
            const r = rows.find(el => el.querySelector('.mt-name').innerText.includes('漫画A'));
            r.click();
        }""",
    )
    # 等待移动完成（页面会 reload）
    pg.wait_for_timeout(1500)

    # 文件系统验证：漫画B 已从根移入漫画A
    assert not os.path.isdir(os.path.join(root, '漫画B')), '源仍在根目录'
    assert os.path.isdir(os.path.join(root, '漫画A', '漫画B')), '未移入漫画A'


def test_move_overlay_closes_on_cancel(live_server, browser):
    pg = _open(live_server, browser)
    pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => {
            const row = items.find(el => el.querySelector('.file-name-col')
                                            .innerText.includes('漫画B'));
            row.querySelector('a[onclick^="moveItem"]').click();
        }""",
    )
    pg.wait_for_selector('#moveOverlay.open')
    pg.click('.move-footer button')  # 取消
    # 关闭后浮层 display:none（hidden），且 class 去掉 open
    pg.wait_for_selector('#moveOverlay', state='hidden')
    assert 'open' not in (pg.get_attribute('#moveOverlay', 'class') or '')
