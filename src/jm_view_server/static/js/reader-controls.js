var readerHelp = document.getElementById('readerHelp');
var readerShortcutList = document.getElementById('readerShortcutList');
(window.JMV_READER_SHORTCUTS || []).forEach(function(item) {
  var row = document.createElement('div');
  row.className = 'reader-shortcut-row';
  row.innerHTML = '<span>' + item.keys.map(function(key) { return '<kbd>' + key + '</kbd>'; }).join('<i>或</i>') + '</span><b>' + item.label + '</b>';
  readerShortcutList.appendChild(row);
});
var readerHelpOpener = null;
function trapOverlayTab(container, event) {
  if (event.key !== 'Tab' || !container) return;
  var focusables = Array.from(container.querySelectorAll('button:not([disabled]):not([hidden]), a[href], input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])')).filter(function(el) {
    return el.offsetParent !== null;
  });
  if (!focusables.length) return;
  var first = focusables[0], last = focusables[focusables.length - 1];
  if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function openReaderHelp() {
  closeReaderModePop();
  readerHelpOpener = document.activeElement;
  readerHelp.inert = false;
  readerHelp.classList.add('show');
  readerHelp.setAttribute('aria-hidden', 'false');
  document.getElementById('readerHelpClose').focus({ preventScroll: true });
}
function closeReaderHelp() {
  if (!readerHelp.classList.contains('show')) return;
  readerHelp.classList.remove('show');
  readerHelp.setAttribute('aria-hidden', 'true');
  readerHelp.inert = true;
  if (readerHelpOpener && readerHelpOpener.isConnected && readerHelpOpener.focus) {
    readerHelpOpener.focus({ preventScroll: true });
  }
  readerHelpOpener = null;
}
if (readerHelp) readerHelp.inert = true;
document.getElementById('tHelp').addEventListener('click', openReaderHelp);
document.getElementById('readerHelpClose').addEventListener('click', closeReaderHelp);
readerHelp.addEventListener('click', function(e) { if (e.target === readerHelp) closeReaderHelp(); });
readerHelp.addEventListener('keydown', function(e) { trapOverlayTab(readerHelp, e); });
readerModePop.querySelectorAll('[data-reader-mode]').forEach(function(button) {
  button.addEventListener('click', function() {
    var mode = button.dataset.readerMode;
    if (mode === 'double') {
      if (readerMode !== 'double') {
        setReaderMode('double');
        setReaderDirectionOpen(true);
      } else {
        setReaderDirectionOpen(readerDirectionControl.hidden);
      }
      return;
    }
    setReaderMode(mode);
  });
});

function changeReaderDirection(direction) {
  applyReadingDirection(direction, true);
  if (window.toast) toast(direction === 'rtl' ? '双页排版：从右向左 (日漫)' : '双页排版：从左向右');
}
document.querySelectorAll('[data-reader-direction]').forEach(function(button) {
  button.addEventListener('click', function() {
    var direction = button.dataset.readerDirection;
    if (readerDirectionControl.contains(button)) {
      applyReadingDirection(direction, true);
      setReaderDirectionOpen(false, true);
    } else {
      changeReaderDirection(direction);
    }
  });
});

var pageClickTimer = null;
var readerHasInteracted = false;
['pointerdown', 'keydown', 'wheel'].forEach(function(name) {
  document.addEventListener(name, function() { readerHasInteracted = true; }, {capture: true, passive: true});
});
stream.addEventListener('click', function(e) {
  if (readerMode !== 'single') return;
  if (imageActions && imageActions.classList.contains('show')) return;
  if (Date.now() < suppressPageClickUntil) return;
  if (e.detail > 1) { clearTimeout(pageClickTimer); return; }
  clearTimeout(pageClickTimer);
  if (e.target.closest && e.target.closest('button, input, select, a')) return;
  var rect = stream.getBoundingClientRect();
  var clickedLeft = e.clientX < rect.left + rect.width / 2;
  gotoPage(activePageIndex + (clickedLeft ? -1 : 1));
});
stream.addEventListener('dblclick', function(e) {
  clearTimeout(pageClickTimer);
});

document.addEventListener('keydown', function(e) {
  if (imageActions && imageActions.classList.contains('show')) return;
  var isEsc = e.key === 'Escape' || e.key === 'Esc';
  if (isEsc) {
    if (jumpPop && jumpPop.classList.contains('show')) { e.preventDefault(); closeJump(true); return; }
    if (!readerModePop.hidden) {
      e.preventDefault();
      if (readerDirectionControl.hidden) closeReaderModePop(true);
      else setReaderDirectionOpen(false, true);
      return;
    }
    if (morePop && morePop.classList.contains('show')) { e.preventDefault(); closeMore(); return; }
    if (readerHelp && readerHelp.classList.contains('show')) { e.preventDefault(); closeReaderHelp(); return; }
    if (readerGridOverlay && readerGridOverlay.classList.contains('show')) { e.preventDefault(); closeReaderGrid(); return; }
    if (!desktopToolbarQuery.matches && rTools && (rTools.classList.contains('is-open') || rTools.classList.contains('is-pinned'))) {
      e.preventDefault();
      setToolbarPinned(false, false);
      closeToolbar(true);
      return;
    }
    return;
  }
  // 缩略图画板或快捷键帮助打开时暂停正文快捷键，防止 Space / 方向键穿透触发翻页
  if ((readerGridOverlay && readerGridOverlay.classList.contains('show')) ||
      (readerHelp && readerHelp.classList.contains('show'))) {
    return;
  }
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
      if (readerMode === 'double' || (e.target.tagName === 'BUTTON' && readerModeTool.contains(e.target))) break;
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
        changeReaderDirection(readingDirection === 'ltr' ? 'rtl' : 'ltr');
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
      closeImageActions();
      closeReaderGrid();
      closeReaderHelp(); closeJump(); closeMore();
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
  { start: 0, end: TOTAL - 1, key: 'jmv-progress:' + ALBUM_ID, title: ALBUM_ID, path: readerConfig.albumPath }
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

var savedProgressAtOpen = null;
try { savedProgressAtOpen = parseInt(localStorage.getItem(PROGRESS_KEY), 10); } catch (e) {}
function initResume() {
  var saved = null;
  saved = savedProgressAtOpen;
  if (window.JmvReaderMemory && !readerConfig.favorites) {
    var shared = JmvReaderMemory.get('progress', readerConfig.albumPath);
    if (shared === null) saved = null;
    else if (shared && shared.image) saved = rawPages.findIndex(function(page) {
      return JmvSync.canonicalPath(JmvReaderMemory.imagePath(page.querySelector('.page-img'))) === JmvSync.canonicalPath(shared.image);
    });
  }
  if (!saved || saved <= 0 || saved >= pages.length) return; // 无记录/首页不提示
  var bar = document.createElement('div');
  bar.className = 'resume-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span style="overflow:hidden;text-overflow:ellipsis">上次看到: 第 <b>' + (saved + 1) + '</b> 页</span>' +
                  '<button type="button" class="resume-go">继续</button>' +
                  '<button type="button" class="resume-close" aria-label="关闭提示">✕</button>' +
                  '<span class="resume-bar-progress" aria-hidden="true"></span>';
  document.body.appendChild(bar);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { bar.classList.add('show'); });
  });
  var remaining = 5000;
  var startedAt = Date.now();
  var autoDismissTimer = null;
  var dismissed = false;
  var hovered = false;
  var focused = false;
  function scheduleDismiss() {
    if (dismissed || hovered || focused || remaining <= 0 || autoDismissTimer) return;
    startedAt = Date.now();
    autoDismissTimer = setTimeout(dismiss, remaining);
  }
  function pauseDismiss() {
    if (!autoDismissTimer) return;
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
    remaining = Math.max(1000, remaining - (Date.now() - startedAt));
  }
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
    bar.classList.remove('show');
    setTimeout(function() { bar.remove(); }, (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 0 : 200);
  }
  bar.addEventListener('mouseenter', function() { hovered = true; pauseDismiss(); });
  bar.addEventListener('mouseleave', function() { hovered = false; scheduleDismiss(); });
  bar.addEventListener('focusin', function() { focused = true; pauseDismiss(); });
  bar.addEventListener('focusout', function(e) {
    if (e.relatedTarget && bar.contains(e.relatedTarget)) return;
    focused = false;
    scheduleDismiss();
  });
  bar.querySelector('.resume-go').addEventListener('click', function() {
    gotoPage(saved);
    dismiss();
  });
  bar.querySelector('.resume-close').addEventListener('click', dismiss);
  scheduleDismiss();
}
function initializeReader() {
  if (readerInitialized) return;
  if (window.JmvPrefs) {
    readerMode = JmvPrefs.get('readerMode');
    readingDirection = JmvPrefs.get('readingDirection');
    doubleWidthScale = JmvPrefs.get('doubleWidthScale');
  }
  readerInitialized = true;
  applyReadingDirection(readingDirection, false);
  setReaderMode(readerMode, { persist: false, initial: true });
  updateDocumentScrollProgress(false);
  if (window.JmvSync) {
    JmvSync.ready.then(function() {
      if (readerHasInteracted) return;
      var shared = readerConfig.favorites ? undefined : JmvReaderMemory.get('sequence', readerConfig.albumPath);
      if (shared !== undefined) {
        var lookup = new Map(rawPages.map(function(page, index) {
          return [JmvSync.canonicalPath(JmvReaderMemory.imagePath(page.querySelector('.page-img'))), index];
        }));
        var seen = new Set();
        pageSequence = shared ? shared.items.map(function(item) {
          if (item.type === 'blank') return {type: 'blank', id: item.id};
          var index = lookup.get(JmvSync.canonicalPath(item.path));
          if (index === undefined || seen.has(index)) return null;
          seen.add(index); return {type: 'page', pageIndex: index};
        }).filter(Boolean) : [];
        originalSequence.forEach(function(item) { if (!seen.has(item.pageIndex)) pageSequence.push({type: 'page', pageIndex: item.pageIndex}); });
        if (typeof pageSequenceRevision === 'number') pageSequenceRevision++;
        isSequencePersisted = shared !== null;
        try {
          localStorage.setItem(PERSIST_SEQUENCE_KEY, isSequencePersisted ? '1' : '0');
          localStorage.setItem(CUSTOM_SEQUENCE_KEY, JSON.stringify(pageSequence));
        } catch (error) {}
        applySequenceToDOM(); rebuildReaderGrid();
      }
      if (JmvSync.allows('readingDirection')) applyReadingDirection(JmvPrefs.get('readingDirection'), false);
      if (JmvSync.allows('doubleWidthScale')) applyDoubleWidthScale(JmvPrefs.get('doubleWidthScale'), false);
      if (JmvSync.allows('readerMode')) setReaderMode(JmvPrefs.get('readerMode'), {persist: false, initial: true});
      if (JmvSync.allows('eyeCare')) applyEye(JmvPrefs.get('eyeCare'), false);
      if (JmvSync.allows('headerHidden')) applyHeaderHidden(JmvPrefs.get('headerHidden'), false);
      if (JmvSync.allows('progressHidden')) applyProgressHidden(JmvPrefs.get('progressHidden'), false);
      if (JmvSync.allows('autoNext')) setAutoNext(JmvPrefs.get('autoNext'), false);
      initResume();
    });
  } else initResume();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeReader, {once: true});
} else initializeReader();
