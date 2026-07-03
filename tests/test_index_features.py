"""
首页新功能端到端验收（纯前端，无 pytest-playwright，用 conftest 的 live_server + browser）：
  #4 首页搜索/过滤：#fileFilter 实时按文件名过滤 .file-item（列表+网格），无匹配显示空态。
  #8 最近浏览历史：localStorage['jmv-recent'] 记录当前目录，#recentBtn 弹面板可回访、去重。
"""


def _open(live_server, browser):
    pg = browser.new_page()
    pg.goto(live_server.url + '/')
    pg.wait_for_selector('.file-item')
    return pg


def _visible_names(pg):
    """列表视图中当前可见（未被 display:none 隐藏）的 .file-item 文件名。"""
    return pg.eval_on_selector_all(
        '.list-view .file-item',
        """items => items
            .filter(el => el.style.display !== 'none')
            .map(el => el.querySelector('.file-name-col').innerText.trim())""",
    )


# ---------- 功能 #4：搜索/过滤 ----------

def test_filter_single_match(live_server, browser):
    pg = _open(live_server, browser)
    pg.fill('#fileFilter', '漫画A')
    names = _visible_names(pg)
    assert any('漫画A' in n for n in names)
    assert not any('漫画B' in n for n in names)
    # 其它项确实被 display:none 隐藏
    hidden = pg.eval_on_selector_all(
        '.list-view .file-item',
        "items => items.filter(el => el.style.display === 'none').length",
    )
    assert hidden > 0


def test_filter_prefix_matches_both(live_server, browser):
    pg = _open(live_server, browser)
    pg.fill('#fileFilter', '漫画')
    names = _visible_names(pg)
    assert any('漫画A' in n for n in names)
    assert any('漫画B' in n for n in names)


def test_filter_clear_restores_all(live_server, browser):
    pg = _open(live_server, browser)
    total = len(pg.query_selector_all('.list-view .file-item'))
    pg.fill('#fileFilter', '漫画A')
    assert len(_visible_names(pg)) < total
    pg.fill('#fileFilter', '')
    assert len(_visible_names(pg)) == total


def test_filter_no_match_shows_empty_state(live_server, browser):
    pg = _open(live_server, browser)
    pg.fill('#fileFilter', '不存在的名字zzz')
    assert _visible_names(pg) == []
    empty = pg.query_selector('#filterEmptyList')
    assert empty.is_visible()


def test_filter_case_insensitive(live_server, browser):
    """英文文件（cover.jpg / readme.txt）大小写不敏感匹配。"""
    pg = _open(live_server, browser)
    pg.fill('#fileFilter', 'COVER')
    names = _visible_names(pg)
    assert any('cover' in n.lower() for n in names)


# ---------- 功能 #8：最近浏览历史 ----------

def test_recent_records_current_path(live_server, browser):
    pg = _open(live_server, browser)
    recent = pg.evaluate("() => JSON.parse(localStorage.getItem('jmv-recent') || '[]')")
    assert isinstance(recent, list) and len(recent) >= 1
    cur = pg.eval_on_selector('#currentPathText', 'el => el.getAttribute("data-path")')
    assert cur in recent


def test_recent_button_opens_panel(live_server, browser):
    pg = _open(live_server, browser)
    pg.click('#recentBtn')
    pg.wait_for_selector('#recentPanel.open')
    entries = pg.query_selector_all('#recentPanel .recent-entry')
    assert len(entries) >= 1


def test_recent_dedup_and_multiple(live_server, browser):
    """进入子目录再回来：recent 有多条且去重（同一路径不重复）。"""
    pg = _open(live_server, browser)
    # 进入子目录 漫画B
    link = pg.query_selector('.file-item[data-type="dir"] .file-link[dirname="漫画B"]')
    assert link is not None
    link.click()
    pg.wait_for_load_state('load')
    pg.wait_for_selector('.file-item, .filter-empty')
    # 回到上级
    pg.click('#btn-back')
    pg.wait_for_load_state('load')
    pg.wait_for_selector('.file-item')

    recent = pg.evaluate("() => JSON.parse(localStorage.getItem('jmv-recent') || '[]')")
    assert len(recent) >= 2, f'recent 应有多条: {recent}'
    assert len(recent) == len(set(recent)), f'recent 应去重: {recent}'
