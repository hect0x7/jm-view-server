"""Reader source-level contracts and pure JavaScript algorithm checks."""
from pathlib import Path


READER_JS_FILES = (
    'reader-core.js',
    'reader-preferences.js',
    'reader-modes.js',
    'reader-contact-sheet.js',
    'reader-controls.js',
)
READER_CSS_FILES = (
    'reader-base.css',
    'reader-modes.css',
    'reader-toolbar.css',
    'reader-contact-sheet.css',
    'reader-extras.css',
)


def _reader_sources(root):
    js_dir = root / 'src/jm_view_server/static/js'
    css_dir = root / 'src/jm_view_server/static/css'
    reader_js = '\n'.join((js_dir / name).read_text(encoding='utf-8') for name in READER_JS_FILES)
    reader_css = '\n'.join((css_dir / name).read_text(encoding='utf-8') for name in READER_CSS_FILES)
    return reader_js, reader_css


def test_hidden_reader_chrome_is_applied_before_first_paint():
    root = Path(__file__).resolve().parents[1]
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')
    reader_js, reader_css = _reader_sources(root)

    prepaint_script = reader_html.index("root.classList.toggle('reader-header-prehidden'")
    first_reader_stylesheet = reader_html.index('/static/css/reader-base.css')
    assert prepaint_script < first_reader_stylesheet
    assert "localStorage.getItem('jmv-head-hidden') !== '0'" in reader_html
    assert "localStorage.getItem('jmv-prog-hidden') === '1'" in reader_html
    assert 'html.reader-header-prehidden .reader-top' in reader_css
    assert 'html.reader-progress-prehidden .r-bottom' in reader_css
    assert "readerTop.classList.add('hidden')" in reader_js
    assert "rBottom.classList.add('hidden')" in reader_js
    assert reader_js.index("rBottom.classList.add('hidden')") < reader_js.index(
        "classList.remove('reader-progress-prehidden')")
    assert reader_js.index("readerTop.classList.add('hidden')") < reader_js.index(
        "classList.remove('reader-header-prehidden')")


def test_double_width_scale_static_contract():
    root = Path(__file__).resolve().parents[1]
    app_js = (root / 'src/jm_view_server/static/js/app.js').read_text(encoding='utf-8')
    reader_js, reader_css = _reader_sources(root)
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


def test_thumbnail_card_canvas_static_contract():
    root = Path(__file__).resolve().parents[1]
    app_js = (root / 'src/jm_view_server/static/js/app.js').read_text(encoding='utf-8')
    reader_js, reader_css = _reader_sources(root)
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')
    agents_md = (root / 'AGENTS.md').read_text(encoding='utf-8')

    assert 'id="readerGridDirControl"' in reader_html
    assert 'id="dirLtr"' in reader_html
    assert 'id="dirRtl"' in reader_html
    assert 'id="readerGridDoublePreview"' in reader_html
    assert 'id="readerGridReverse"' in reader_html
    assert 'id="readerGridReset"' in reader_html
    assert 'id="readerGridPersist"' in reader_html
    assert 'id="tInsertPage"' not in reader_html
    assert 'reader-grid-toolbar' in reader_css
    assert 'reader-grid-dir-control' in reader_css
    assert 'reader-grid-insert-btn' in reader_css
    assert 'reader-grid-blank' in reader_css
    assert 'reader-grid-blank-del' in reader_css
    assert 'reader-grid-spread-row' in reader_css
    assert 'pageSequence' in reader_js
    assert 'isSequencePersisted' in reader_js
    assert 'isGridDoublePreview' in reader_js
    assert 'bindCardDragEvents' in reader_js
    assert 'function moveGridSequenceItem(' in reader_js
    assert 'function commitGridSequenceMove(' in reader_js
    assert "pointerHandle.addEventListener('pointerdown'" in reader_js
    assert "pointerHandle.addEventListener('pointermove'" in reader_js
    assert "pointerHandle.addEventListener('pointerup'" in reader_js
    assert "pointerHandle.addEventListener('pointercancel'" in reader_js
    assert "pointerHandle.setPointerCapture(e.pointerId)" in reader_js
    assert 'finishPointerGridDrag(e.pointerId, false);' in reader_js
    assert '@media (max-width: 860px), (hover: none), (pointer: coarse)' in reader_css
    assert '.reader-grid-blank-del { width: 44px; height: 44px;' in reader_css
    assert '.reader-grid-drag-handle { min-width: 44px; min-height: 44px;' in reader_css
    assert '.reader-grid-spread-row .reader-grid-blank-drag-tip { display: inline-flex; }' in reader_css
    assert 'readerGridDoublePreview' in reader_js
    assert 'readerGridReverse' in reader_js
    assert 'readerGridReset' in reader_js
    assert 'readerGridPersist' in reader_js
    assert '缩略图可视化卡片画板' in agents_md


def test_thumbnail_card_canvas_algorithm_node_eval():
    import json
    import subprocess
    root = Path(__file__).resolve().parents[1]
    reader_js, _ = _reader_sources(root)

    js_test_script = """
    const pages = [{}, {}, {}, {}, {}];
    let readingDirection = 'ltr';
    let pageSequence = [{type:'page', pageIndex: 0}, {type:'page', pageIndex: 1}, {type:'page', pageIndex: 2}, {type:'page', pageIndex: 3}, {type:'page', pageIndex: 4}];
    function isWidePage(idx) { return false; }
    """ + reader_js[reader_js.find('function pushDoublePair('):reader_js.find('function findDoubleGroupIndex(')] + """

    // 1. Default sequence double groups
    const defGroups = buildDoubleGroups();
    const defSlots = defGroups.map(g => g.slots);

    // 2. Drag & reorder: move page 3 before page 1
    const moved = pageSequence.splice(3, 1)[0];
    pageSequence.splice(1, 0, moved);
    const reorderedSequence = pageSequence.map(x => x.pageIndex);
    const reorderedGroups = buildDoubleGroups();
    const reorderedSlots = reorderedGroups.map(g => g.slots);

    // 3. Insert multiple blanks at beginning: [b1, b2, b3, 0, 3, 1, 2, 4]
    pageSequence.unshift({ type: 'blank', id: 'b1' }, { type: 'blank', id: 'b2' }, { type: 'blank', id: 'b3' });
    const multiBlankHeadGroups = buildDoubleGroups();
    const multiBlankHeadSlots = multiBlankHeadGroups.map(g => g.slots);
    const multiBlankHeadInserted = multiBlankHeadGroups.map(g => g.insertedSlots);

    // 4. Reverse sequence
    pageSequence = [{type:'page', pageIndex: 4}, {type:'page', pageIndex: 3}, {type:'page', pageIndex: 2}, {type:'page', pageIndex: 1}, {type:'page', pageIndex: 0}];
    const reversedGroups = buildDoubleGroups();
    const reversedSlots = reversedGroups.map(g => g.slots);

    console.log(JSON.stringify({ defSlots, reorderedSequence, reorderedSlots, multiBlankHeadSlots, multiBlankHeadInserted, reversedSlots }));
    """

    proc = subprocess.run(['node', '-e', js_test_script], capture_output=True, text=True, check=True)
    data = json.loads(proc.stdout)

    assert data['defSlots'] == [[None, 0], [1, 2], [3, 4]]
    assert data['reorderedSequence'] == [0, 3, 1, 2, 4]
    assert data['reorderedSlots'] == [[None, 0], [3, 1], [2, 4]]
    # multi blanks: row 1 is [b1, b2], row 2 is [b3, 0], row 3 is [3, 1], row 4 is [2, 4]
    assert data['multiBlankHeadSlots'] == [[None, None], [None, 0], [3, 1], [2, 4]]
    assert data['multiBlankHeadInserted'] == [[0, 1], [0], [], []]
    assert data['reversedSlots'] == [[None, 4], [3, 2], [1, 0]]


def test_contact_sheet_shared_move_algorithm_node_eval():
    import json
    import subprocess
    root = Path(__file__).resolve().parents[1]
    reader_js, _ = _reader_sources(root)
    move_function = reader_js[
        reader_js.index('function moveGridSequenceItem('):
        reader_js.index('function commitGridSequenceMove(')
    ]
    js_test_script = """
    var pageSequence = [0, 1, 2, 3, 4].map(function(pageIndex) {
      return { type: 'page', pageIndex: pageIndex };
    });
    """ + move_function + """
    var changed = moveGridSequenceItem(0, 2, true);
    var afterMove = pageSequence.map(function(item) { return item.pageIndex; });
    var noOp = moveGridSequenceItem(2, 2, false);
    var afterNoOp = pageSequence.map(function(item) { return item.pageIndex; });
    console.log(JSON.stringify({ changed, afterMove, noOp, afterNoOp }));
    """

    proc = subprocess.run(['node', '-e', js_test_script], capture_output=True, text=True, check=True)
    data = json.loads(proc.stdout)
    assert data == {
        'changed': True,
        'afterMove': [1, 2, 0, 3, 4],
        'noOp': False,
        'afterNoOp': [1, 2, 0, 3, 4],
    }


def test_static_javascript_syntax_validity():
    import subprocess
    root = Path(__file__).resolve().parents[1]
    js_dir = root / 'src/jm_view_server/static/js'
    js_files = list(js_dir.glob('*.js'))
    assert len(js_files) > 0

    for js_file in js_files:
        res = subprocess.run(['node', '--check', str(js_file)], capture_output=True, text=True)
        assert res.returncode == 0, f"JavaScript syntax error in {js_file.name}:\n{res.stderr}"


def test_toolbar_pinned_static_contract():
    root = Path(__file__).resolve().parents[1]
    reader_js, reader_css = _reader_sources(root)
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')

    assert 'id="toolsHandle"' in reader_html
    assert 'aria-pressed="false"' in reader_html
    assert 'toolbarPinned = !!pinned;' in reader_js
    assert "toolsHandle.setAttribute('aria-pressed', toolbarPinned ? 'true' : 'false');" in reader_js
    assert 'setToolbarPinned(false, false);' in reader_js
    assert '.reader-tools-handle:focus-visible {' in reader_css
    assert 'outline: 3px solid var(--brand-ring);' in reader_css
    assert '.r-tools.is-pinned .reader-tools-handle,' in reader_css
    assert 'opacity: 1; color: #fff; background: var(--brand);' in reader_css
    assert 'class="reader-tools-pin"' in reader_html
    assert 'class="reader-tools-close"' not in reader_html
    assert '>×</span>' not in reader_html
    assert '<i></i>' not in reader_html
    assert '.r-tools.is-pinned .reader-tools-pin { opacity: 1; }' in reader_css
    assert '.r-tools.is-pinned .reader-tools-main {' in reader_css
    assert 'position: relative; z-index: 3;' in reader_css
    assert '.reader-tools-main [data-tip]:hover { z-index: 50; }' in reader_css
    assert '.reader-tools-pin, .reader-tools-handle::after, .reader-scroll-progress { transition: none; }' in reader_css
    assert "toolsHandle.setAttribute('aria-label', toolbarPinned ? '取消固定阅读工具栏' : '固定阅读工具栏');" in reader_js
    assert 'closeToolbar(false);' in reader_js
    assert 'function activateToolbarHandle() {' in reader_js
    assert reader_js.count('activateToolbarHandle();') == 2
    assert "else if (rTools.classList.contains('is-open')) closeToolbar(true);" not in reader_js
    assert '@media (max-width: 860px) {' in reader_css
    assert 'setToolbarPinned(false, false);\n        closeToolbar(true);' in reader_js


def test_mobile_reader_uses_dynamic_viewport_and_touch_sized_sheet_controls():
    root = Path(__file__).resolve().parents[1]
    reader_js, reader_css = _reader_sources(root)
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')

    assert 'height: 100dvh;' in reader_css
    assert 'max-height: calc(100dvh - 104px);' in reader_css
    assert 'min-height: 100dvh;' in reader_css
    assert 'height: min(820px, calc(100dvh - 40px));' in reader_css
    assert '.reader-grid-dir-btn,\n  .reader-grid-toolbar-btn,\n  .reader-grid-close { min-height: 44px; }' in reader_css
    assert '.reader-grid-close { width: 44px; min-width: 44px; }' in reader_css
    assert '.reader-grid-persist-toggle { min-height: 44px;' in reader_css
    assert '.r-tools:focus-within > .reader-tools-handle { width: 44px; height: 44px; }' in reader_css
    assert '悬停或触屏操作可插入空白页' in reader_html
    assert reader_js.count("case 'ArrowUp':") == 1
    assert reader_js.count("case 't': case 'T':") == 1


def test_reader_open_folder_and_fullscreen_feedback_static_contract():
    root = Path(__file__).resolve().parents[1]
    app_js = (root / 'src/jm_view_server/static/js/app.js').read_text(encoding='utf-8')
    index_js = (root / 'src/jm_view_server/static/js/index.js').read_text(encoding='utf-8')
    reader_js, reader_css = _reader_sources(root)
    reader_html = (root / 'src/jm_view_server/templates/jm_view.html').read_text(encoding='utf-8')

    assert 'function openDir(file, reveal) {' in app_js
    assert 'window.openDir = openDir;' in app_js
    assert 'function openDir(file, reveal) {' not in index_js
    assert 'id="tOpenFolder"' in reader_html
    assert "'albumPath': data.full_path" in reader_html
    assert "openDir(encodeURIComponent(readerConfig.albumPath), false);" in reader_js
    assert "document.getElementById('tOpenFolder').innerHTML = icon('folder');" in reader_js
    assert 'id="tFull" title="全屏阅读" data-tip="全屏阅读" aria-pressed="false"' in reader_html
    assert "button.classList.toggle('active', isFull);" in reader_js
    assert "button.setAttribute('aria-pressed', isFull ? 'true' : 'false');" in reader_js
    assert "document.addEventListener('fullscreenchange', syncFullscreenButton);" in reader_js
    assert "action.then(syncFullscreenButton, syncFullscreenButton);" in reader_js
    assert 'setTimeout(syncFullscreenButton, 300);' in reader_js
    assert '.r-tools #tFull.active,' in reader_css


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
    reader_js, reader_css = _reader_sources(root)
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
