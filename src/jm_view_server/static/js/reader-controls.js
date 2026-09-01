var readerHelp = document.getElementById('readerHelp');
var readerShortcutList = document.getElementById('readerShortcutList');
(window.JMV_READER_SHORTCUTS || []).forEach(function(item) {
  var row = document.createElement('div');
  row.className = 'reader-shortcut-row';
  row.innerHTML = '<span>' + item.keys.map(function(key) { return '<kbd>' + key + '</kbd>'; }).join('<i>或</i>') + '</span><b>' + item.label + '</b>';
  readerShortcutList.appendChild(row);
});
function openReaderHelp() { readerHelp.classList.add('show'); document.getElementById('readerHelpClose').focus(); }
function closeReaderHelp() { readerHelp.classList.remove('show'); }
document.getElementById('tHelp').addEventListener('click', openReaderHelp);
document.getElementById('readerHelpClose').addEventListener('click', closeReaderHelp);
readerHelp.addEventListener('click', function(e) { if (e.target === readerHelp) closeReaderHelp(); });
document.getElementById('modeScroll').addEventListener('click', function() { setReaderMode('scroll'); });
document.getElementById('modeSingle').addEventListener('click', function() { setReaderMode('single'); });
var modeDoubleButton = document.getElementById('modeDouble');
if (modeDoubleButton) modeDoubleButton.addEventListener('click', function() { setReaderMode('double'); });

var dirLtrBtn = document.getElementById('dirLtr');
var dirRtlBtn = document.getElementById('dirRtl');
if (dirLtrBtn) dirLtrBtn.addEventListener('click', function() {
  applyReadingDirection('ltr', true);
  if (window.toast) toast('双页排版：从左向右');
});
if (dirRtlBtn) dirRtlBtn.addEventListener('click', function() {
  applyReadingDirection('rtl', true);
  if (window.toast) toast('双页排版：从右向左 (日漫)');
});

var pageClickTimer = null;
stream.addEventListener('click', function(e) {
  if (readerMode !== 'single') return;
  if (Date.now() < suppressPageClickUntil) return;
  if (e.detail > 1) return;
  clearTimeout(pageClickTimer);
  pageClickTimer = setTimeout(function() {
    var rect = stream.getBoundingClientRect();
    var clickedLeft = e.clientX < rect.left + rect.width / 2;
    var delta = clickedLeft ? -1 : 1;
    gotoPage(activePageIndex + delta);
  }, 220);
});
stream.addEventListener('dblclick', function(e) {
  clearTimeout(pageClickTimer);
});

document.addEventListener('keydown', function(e) {
  if (inEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  var cur = currentPageIdx();
  switch (e.key) {
    case 'ArrowLeft':
      if (readerMode === 'double') break;
      e.preventDefault();
      gotoPage(cur - 1);
      break;
    case 'ArrowRight':
      if (readerMode === 'double') break;
      e.preventDefault();
      gotoPage(cur + 1);
      break;
    case 'ArrowUp':
      if (readerMode === 'double') break;
      break;
    case 'ArrowDown':
      if (readerMode === 'double') break;
      break;
    case 'PageUp':
      if (readerMode === 'double') break;
      e.preventDefault(); if (!scrollActiveSinglePage(-1)) gotoPage(cur - 1); break;
    case 'PageDown':
      if (readerMode === 'double') break;
      e.preventDefault(); if (!scrollActiveSinglePage(1)) gotoPage(cur + 1); break;
    case ' ':
      if (readerMode === 'double') break;
      e.preventDefault(); if (!scrollActiveSinglePage(1)) gotoPage(cur + 1); break;
    case 'Home':
      if (readerMode === 'double') break;
      e.preventDefault(); gotoPage(0); break;
    case 'End':
      if (readerMode === 'double') break;
      e.preventDefault(); gotoPage(pages.length - 1); break;
    case 'f': case 'F':
      e.preventDefault(); document.getElementById('tFull').click(); break;
    case 'g': case 'G':
      e.preventDefault(); openJump(); break;
    case 't': case 'T':
    case 'i': case 'I':
      e.preventDefault();
      if (readerGridOverlay && readerGridOverlay.classList.contains('show')) closeReaderGrid();
      else openReaderGrid();
      break;
    case 'd': case 'D':
      if (readerMode === 'double') {
        e.preventDefault();
        var nextDir = readingDirection === 'ltr' ? 'rtl' : 'ltr';
        applyReadingDirection(nextDir, true);
        if (window.toast) toast(nextDir === 'rtl' ? '双页排版：从右向左 (日漫)' : '双页排版：从左向右');
      }
      break;
    case 'm': case 'M':
      e.preventDefault();
      setReaderMode(readerMode === 'scroll' ? 'single' : (readerMode === 'single' ? 'double' : 'scroll'));
      break;
    case 'h': case 'H':
      e.preventDefault();
      activateToolbarHandle();
      break;
    case '?':
      e.preventDefault(); openReaderHelp(); break;
    case 'Escape':
    case 'Esc':
      closeRotateRadial();
      closeReaderGrid();
      closeReaderHelp(); closeJump(); closeSize(); closeMore();
      if (!desktopToolbarQuery.matches) {
        setToolbarPinned(false, false);
        closeToolbar(true);
      }
      break;
    default: break;
  }
});

// ---------- 项1：阅读进度记忆 ----------
// 滚动时把当前页相对各本文件夹的索引分别写入各自的 localStorage
var ALBUM_RANGES = [
  { start: 0, end: TOTAL - 1, key: 'jmv-progress:' + ALBUM_ID, title: ALBUM_ID }
];
var saveTimer = null;
var scrollProgressIndicator = document.getElementById('readerScrollProgress');
var scrollProgressFrame = null;
var scrollbarDragPointerId = null;

function hideDocumentScrollProgress() {
  scrollbarDragPointerId = null;
  if (scrollProgressIndicator) scrollProgressIndicator.classList.remove('is-visible');
}

function canShowDocumentScrollProgress() {
  if (!scrollProgressIndicator || readerMode === 'single' || !desktopToolbarQuery.matches) return false;
  return document.documentElement.scrollHeight - window.innerHeight > 1;
}

function isNativeScrollbarThumbPointerDown(e) {
  if (!canShowDocumentScrollProgress()) return false;
  if (!e.isPrimary || e.pointerType !== 'mouse' || e.button !== 0) return false;
  if (e.target !== document.documentElement || e.clientX < document.documentElement.clientWidth) return false;
  var viewportHeight = document.documentElement.clientHeight;
  var scrollHeight = document.documentElement.scrollHeight;
  var maxScroll = scrollHeight - window.innerHeight;
  var thumbHeight = Math.min(viewportHeight, Math.max(52, viewportHeight * viewportHeight / scrollHeight));
  var thumbTop = maxScroll > 0 ? (window.scrollY / maxScroll) * (viewportHeight - thumbHeight) : 0;
  return e.clientY >= thumbTop && e.clientY <= thumbTop + thumbHeight;
}

function updateDocumentScrollProgress(show) {
  if (!scrollProgressIndicator) return;
  if (!canShowDocumentScrollProgress()) {
    hideDocumentScrollProgress();
    return;
  }
  var scrollHeight = document.documentElement.scrollHeight;
  var maxScroll = scrollHeight - window.innerHeight;
  if (maxScroll <= 1) {
    hideDocumentScrollProgress();
    return;
  }
  var progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
  scrollProgressIndicator.textContent = Math.round(progress * 100) + '%';
  if (!show) {
    hideDocumentScrollProgress();
    return;
  }
  scrollProgressIndicator.classList.add('is-visible');
}

document.documentElement.addEventListener('pointerdown', function(e) {
  if (!isNativeScrollbarThumbPointerDown(e)) return;
  scrollbarDragPointerId = e.pointerId;
  updateDocumentScrollProgress(true);
});

window.addEventListener('pointerup', function(e) {
  if (scrollbarDragPointerId === e.pointerId) hideDocumentScrollProgress();
});
window.addEventListener('pointercancel', function(e) {
  if (scrollbarDragPointerId === e.pointerId) hideDocumentScrollProgress();
});
window.addEventListener('blur', hideDocumentScrollProgress);

window.addEventListener('scroll', function() {
  if (!scrollProgressFrame) {
    scrollProgressFrame = requestAnimationFrame(function() {
      scrollProgressFrame = null;
      updateDocumentScrollProgress(scrollbarDragPointerId !== null);
    });
  }
  if (readerMode === 'single') return;
  if (saveTimer) return;
  saveTimer = setTimeout(function() {
    saveTimer = null;
    saveCurrentProgress(currentPageIdx());
  }, 300);
}, { passive: true });
window.addEventListener('resize', function() { updateDocumentScrollProgress(false); });

(function initResume() {
  var saved = null;
  try { saved = parseInt(localStorage.getItem(PROGRESS_KEY), 10); } catch (e) {}
  if (!saved || saved <= 0 || saved >= pages.length) return; // 无记录/首页不提示
  var bar = document.createElement('div');
  bar.className = 'resume-bar';
  bar.innerHTML = '<span style="overflow:hidden;text-overflow:ellipsis">上次看到: 第 <b>' + (saved + 1) + '</b> 页</span>' +
                  '<button class="resume-go">继续</button>' +
                  '<button class="resume-close">✕</button>';
  document.body.appendChild(bar);
  requestAnimationFrame(function() { bar.classList.add('show'); });
  var autoDismissTimer = setTimeout(dismiss, 5000);
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoDismissTimer);
    bar.classList.remove('show');
    setTimeout(function() { bar.remove(); }, 200);
  }
  bar.querySelector('.resume-go').addEventListener('click', function() {
    gotoPage(saved);
    dismiss();
  });
  bar.querySelector('.resume-close').addEventListener('click', dismiss);
})();
setReaderMode(readerMode, { persist: false, initial: true });
updateDocumentScrollProgress(false);
