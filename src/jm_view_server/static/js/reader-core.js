var readerConfigElement = document.getElementById('readerConfig');
var readerConfig = JSON.parse(readerConfigElement.textContent);
var readerModeTool = document.getElementById('readerModeTool');
var readerModeTrigger = document.getElementById('tReaderMode');
var readerModePop = document.getElementById('readerModePop');
var modeDoubleButton = document.getElementById('modeDouble');
var readerDirectionControl = document.getElementById('readerDirectionControl');
var readerModeIcons = { scroll: 'scrollPages', single: 'singlePage', double: 'doublePage' };

// 填充图标（app.js 的 icon() 可用）
document.getElementById('backBtn').innerHTML = icon('arrowLeft');
document.getElementById('gotop').innerHTML = icon('arrowUp');
document.getElementById('gobottom').innerHTML = icon('arrowDown');
document.getElementById('tJump').innerHTML = icon('list');
document.getElementById('tProg').innerHTML = icon('slider');
document.getElementById('tEye').innerHTML = icon('eye');
document.getElementById('tFull').innerHTML = icon('fullscreen');
document.getElementById('loadAll').innerHTML = icon('download');
document.getElementById('tOpenFolder').innerHTML = icon('folder');
document.getElementById('tHead').innerHTML = icon('panelTop');
document.getElementById('tMore').innerHTML = icon('more');
document.getElementById('tSizeReset').innerHTML = icon('reset');
document.getElementById('tAutoNext').innerHTML = icon('autoNext');
var tGridButton = document.getElementById('tGrid');
if (tGridButton) tGridButton.innerHTML = icon('grid');
readerModePop.querySelectorAll('[data-reader-mode]').forEach(function(button) {
  button.querySelector('.reader-mode-icon').innerHTML = icon(readerModeIcons[button.dataset.readerMode]);
});
// 搜原本与原路返回图标（兼容 data-tip 与旧 title 属性）
(function() {
  var links = document.querySelectorAll('.r-tools a, .more-pop a');
  links.forEach(function(a) {
    var tip = a.getAttribute('data-tip') || a.title || '';
    if (tip === '原路返回' && !a.id) a.innerHTML = icon('arrowLeft');
    if (tip === '搜原本') a.innerHTML = icon('search');
  });
})();

// 全屏按钮
document.getElementById('tFull').onclick = function() {
  var doc = document.documentElement;
  var isFull = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  var action;
  if (isFull) {
    if (document.exitFullscreen) action = document.exitFullscreen();
    else if (document.webkitExitFullscreen) action = document.webkitExitFullscreen();
    else if (document.msExitFullscreen) action = document.msExitFullscreen();
  } else {
    if (doc.requestFullscreen) action = doc.requestFullscreen();
    else if (doc.webkitRequestFullscreen) action = doc.webkitRequestFullscreen();
    else if (doc.msRequestFullscreen) action = doc.msRequestFullscreen();
    else if (window.toast) toast('当前浏览器不支持全屏API');
  }
  if (action && typeof action.then === 'function') action.then(syncFullscreenButton, syncFullscreenButton);
  else setTimeout(syncFullscreenButton, 0);
  setTimeout(syncFullscreenButton, 300);
};
function syncFullscreenButton() {
  var isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  var button = document.getElementById('tFull');
  button.classList.toggle('active', isFull);
  button.setAttribute('aria-pressed', isFull ? 'true' : 'false');
}
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
document.addEventListener('MSFullscreenChange', syncFullscreenButton);

document.getElementById('tOpenFolder').addEventListener('click', function(e) {
  this.blur();
  e.stopPropagation();
  openDir(encodeURIComponent(readerConfig.albumPath), false);
});

// 当前阅读页统一更新页码、跳页选择和进度条。
var TOTAL = document.querySelectorAll('#pageselect option').length;
var fill = document.getElementById('fill');
var curPage = document.getElementById('curPage');
var topProg = document.getElementById('topProg');
var pages = document.querySelectorAll('.scramble-page');
var readerMode = window.JmvPrefs ? JmvPrefs.get('readerMode') : (localStorage.getItem('jmv-reader-mode') || 'scroll');
var singleFit = window.JmvPrefs ? JmvPrefs.get('singleFit') : (localStorage.getItem('jmv-single-fit') || 'contain');
var doubleWidthScale = window.JmvPrefs ? JmvPrefs.get('doubleWidthScale') : (function() {
  var saved = parseInt(localStorage.getItem('jmv-double-width-scale'), 10);
  return Math.max(50, Math.min(100, isNaN(saved) ? 98 : saved));
})();
var readingDirection = window.JmvPrefs ? JmvPrefs.get('readingDirection') : (localStorage.getItem('jmv-reading-direction') || 'ltr');
if (readingDirection !== 'rtl') readingDirection = 'ltr';
var activePageIndex = 0;
var activeDoubleGroupIndex = 0;
var doubleGroups = [];
var doubleRebuildTimer = null;
var readerInitialized = false;
var doubleBlankSlots = [];
var doubleLayoutOriginalStyles = null;
var viewportRestoreFrame = null;

function captureReaderViewport() {
  if (readerMode === 'single') return null;
  var index = currentPageIdx();
  var anchor = pages[index];
  return {
    anchor: anchor || null,
    top: anchor ? anchor.getBoundingClientRect().top : 0,
    scrollY: window.scrollY
  };
}

function restoreReaderViewport(snapshot) {
  if (!snapshot || readerMode === 'single') return;
  function adjust() {
    if (snapshot.anchor && snapshot.anchor.isConnected) {
      var delta = snapshot.anchor.getBoundingClientRect().top - snapshot.top;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
    } else if (Math.abs(window.scrollY - snapshot.scrollY) > 0.5) {
      window.scrollTo(0, snapshot.scrollY);
    }
  }
  cancelAnimationFrame(viewportRestoreFrame);
  adjust();
  viewportRestoreFrame = requestAnimationFrame(function() {
    viewportRestoreFrame = null;
    adjust();
  });
}

function preserveReaderViewport(change) {
  var snapshot = captureReaderViewport();
  change();
  restoreReaderViewport(snapshot);
}

var isScrubbingTrack = false;

function updateProgress(idx) {
  var p = Math.max(0, Math.min(TOTAL - 1, idx));
  if (fill && !isScrubbingTrack) fill.style.width = (TOTAL > 1 ? (p / (TOTAL - 1) * 100) : 100).toFixed(0) + '%';
  if (curPage) curPage.textContent = '第 ' + (p + 1) + ' 页';
  if (topProg) topProg.textContent = String(p + 1).padStart(2, '0') + ' / ' + TOTAL;
  var bottomSelect = document.getElementById('pageselect');
  var toolSelect = document.getElementById('jumpSelect');
  if (bottomSelect) bottomSelect.value = String(p);
  if (toolSelect) toolSelect.value = String(p);
  updateInsertPageButtonState();
}

function onScroll() {
  if (!readerInitialized || isScrubbingTrack) return;
  if (readerMode === 'double') {
    updateDoubleGroupFromScroll();
    return;
  }
  if (readerMode !== 'scroll') return;
  updateProgress(currentPageIdx());
}
window.addEventListener('scroll', onScroll, { passive: true });

// 点击及拖拽底部进度条跳页（缓存轨道尺寸 + 每帧 rAF 更新 + 44px 触控热区与防越界页码气泡）
var ps = document.getElementById('pageselect');
var track = document.getElementById('track');
if (track) {
  var trackTip = document.createElement('span');
  trackTip.className = 'r-track-tip';
  trackTip.setAttribute('aria-hidden', 'true');
  track.appendChild(trackTip);

  var scrubbingPointerId = null;
  var scrubTargetIdx = 0;
  var scrubTrackRect = null;
  var scrubPendingX = null;
  var scrubRafId = 0;

  function ratioFromClientX(clientX) {
    var r = scrubTrackRect || track.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }

  function applyScrubPreview(clientX) {
    var ratio = ratioFromClientX(clientX);
    scrubTargetIdx = Math.round(ratio * Math.max(0, TOTAL - 1));
    var pct = (ratio * 100).toFixed(1) + '%';
    if (fill) fill.style.width = pct;
    trackTip.style.setProperty('--scrub-pct', pct);
    trackTip.textContent = '第 ' + (scrubTargetIdx + 1) + ' / ' + TOTAL + ' 页';
  }

  function flushScrubFrame() {
    scrubRafId = 0;
    if (scrubbingPointerId === null || scrubPendingX === null) return;
    applyScrubPreview(scrubPendingX);
  }

  track.addEventListener('pointerdown', function(e) {
    if (!readerInitialized || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    scrubbingPointerId = e.pointerId;
    isScrubbingTrack = true;
    scrubTrackRect = track.getBoundingClientRect();
    scrubPendingX = e.clientX;
    track.classList.add('is-scrubbing');
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    applyScrubPreview(e.clientX);
    e.preventDefault();
  });

  track.addEventListener('pointermove', function(e) {
    if (scrubbingPointerId !== e.pointerId) return;
    scrubPendingX = e.clientX;
    if (!scrubRafId) scrubRafId = requestAnimationFrame(flushScrubFrame);
  });

  function finishScrub(pointerId, commit, finalClientX) {
    if (scrubbingPointerId === null) return;
    if (pointerId !== null && scrubbingPointerId !== pointerId) return;
    if (scrubRafId) { cancelAnimationFrame(scrubRafId); scrubRafId = 0; }
    if (commit && typeof finalClientX === 'number') {
      applyScrubPreview(finalClientX);
    }
    scrubbingPointerId = null;
    isScrubbingTrack = false;
    scrubTrackRect = null;
    scrubPendingX = null;
    track.classList.remove('is-scrubbing');
    if (commit) gotoPage(scrubTargetIdx);
    else updateProgress(currentPageIdx());
  }

  track.addEventListener('pointerup', function(e) { finishScrub(e.pointerId, true, e.clientX); });
  track.addEventListener('pointercancel', function(e) { finishScrub(e.pointerId, false); });
  track.addEventListener('lostpointercapture', function(e) { finishScrub(e.pointerId, false); });
  window.addEventListener('blur', function() { finishScrub(null, false); });
}

// 回到顶部 / 跳到底部统一接管（尊重减弱动态设置）
document.getElementById('gotop').addEventListener('click', function() {
  if (!readerInitialized) return;
  this.blur();
  if (isPagedMode()) gotoPage(0);
  else window.scrollTo({ top: 0, behavior: (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth' });
});
document.getElementById('gobottom').addEventListener('click', function() {
  if (!readerInitialized) return;
  this.blur();
  if (isPagedMode()) gotoPage(pages.length - 1);
  else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 'auto' : 'smooth' });
});

// 进度条开关：显隐状态记忆到 localStorage['jmv-prog-hidden']，进入时恢复（默认开启）。
var tProg = document.getElementById('tProg');
var rBottom = document.getElementById('rBottom');

// 恢复状态
var hidden = localStorage.getItem('jmv-prog-hidden') === '1';
if (hidden) {
  rBottom.classList.add('hidden');
  rBottom.inert = true;
  tProg.classList.toggle('active', !hidden);
  tProg.setAttribute('aria-pressed', 'false');
} else {
  tProg.classList.toggle('active', !hidden);
  tProg.setAttribute('aria-pressed', 'true');
}
document.documentElement.classList.remove('reader-progress-prehidden');

function applyProgressHidden(value, persist) {
  var isHidden = !!value;
  rBottom.classList.toggle('hidden', isHidden);
  rBottom.inert = isHidden;
  tProg.classList.toggle('active', !isHidden);
  tProg.setAttribute('aria-pressed', isHidden ? 'false' : 'true');
  if (persist && window.JmvPrefs) JmvPrefs.set('progressHidden', isHidden);
}

tProg.addEventListener('click', function() {
  this.blur();
  var willHide = !rBottom.classList.contains('hidden');
  preserveReaderViewport(function() {
    applyProgressHidden(willHide, true);
  });
});

// 项2：工具栏“跳转页码”——贴附工具栏的原地浮窗（非全屏 modal，参考旧版直白交互）。
// 页码用下拉选择（同底部进度条 pageselect），选中即跳页并收起浮窗；点外部/Esc 收起。
var tJump = document.getElementById('tJump');
var jumpPop = document.getElementById('jumpPop');
var jumpSelect = document.getElementById('jumpSelect'); // <select>，value 为 0-based 页索引
if (jumpPop) {
  jumpPop.inert = true;
  jumpPop.setAttribute('aria-hidden', 'true');
}

function currentPageIdx() {
  if (readerMode !== 'scroll') return activePageIndex;
  var middle = window.innerHeight / 2;
  var nearestPage = 0;
  var nearestDistance = Infinity;
  for (var i = 0; i < pages.length; i++) {
    var rect = pages[i].getBoundingClientRect();
    if (rect.top <= middle && middle < rect.bottom) return i;
    var distance = Math.max(rect.top - middle, middle - rect.bottom, 0);
    if (distance < nearestDistance) {
      nearestPage = i;
      nearestDistance = distance;
    }
  }
  return nearestPage;
}
function openJump() {
  closeReaderModePop();
  jumpSelect.value = String(currentPageIdx());
  jumpPop.inert = false;
  jumpPop.setAttribute('aria-hidden', 'false');
  jumpPop.classList.add('show');
  openToolbar();
  requestAnimationFrame(function() {
    if (jumpPop.classList.contains('show')) jumpSelect.focus({ preventScroll: true });
  });
}
function closeJump(restoreFocus) {
  if (!jumpPop || !jumpPop.classList.contains('show')) return;
  var hadFocus = jumpPop.contains(document.activeElement);
  jumpPop.classList.remove('show');
  jumpPop.inert = true;
  jumpPop.setAttribute('aria-hidden', 'true');
  if (hadFocus && restoreFocus !== false && tJump && tJump.focus) {
    tJump.focus({ preventScroll: true });
  } else if (hadFocus && document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  scheduleToolbarClose();
}
tJump.addEventListener('click', function(e) {
  e.stopPropagation();
  if (jumpPop.classList.contains('show')) closeJump(); else openJump();
});
// 选中即跳页并收起浮窗
jumpSelect.addEventListener('change', function() {
  if (!readerInitialized) return;
  var idx = parseInt(jumpSelect.value, 10); // 下拉选项天然合法
  closeJump();
  gotoPage(idx);
});
if (ps) {
  ps.addEventListener('change', function() {
    if (!readerInitialized) return;
    gotoPage(parseInt(ps.value, 10));
  });
}
// 点击浮窗外部收起（点浮窗内部不关，以免影响下拉展开）
document.addEventListener('click', function(e) {
  if (!readerModeTool.contains(e.target)) closeReaderModePop();
  if (jumpPop.classList.contains('show') && !jumpPop.contains(e.target) && e.target !== tJump) closeJump();
  if (morePop.classList.contains('show') && !morePop.contains(e.target) && e.target !== tMore) closeMore();
  if (rTools && !desktopToolbarQuery.matches && rTools.classList.contains('is-open') && !rTools.contains(e.target)) {
    closeToolbar(false);
  }
});
var rTools = document.querySelector('.r-tools');
var toolsHandle = document.getElementById('toolsHandle');
var desktopToolbarQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
var toolbarCloseTimer = null;
var toolbarPinned = false;

function toolbarPanelOpen() {
  return !readerModePop.hidden || jumpPop.classList.contains('show') ||
    (morePop && morePop.classList.contains('show'));
}

function syncToolbarExpandedBodyState() {
  var expanded = !!(rTools && (rTools.classList.contains('is-open') || rTools.classList.contains('is-pinned')));
  document.body.classList.toggle('reader-tools-expanded', expanded);
}

function openToolbar() {
  clearTimeout(toolbarCloseTimer);
  rTools.classList.add('is-open');
  toolsHandle.setAttribute('aria-expanded', 'true');
  toolsHandle.setAttribute('aria-label', toolbarPinned ? '取消固定阅读工具栏' : '固定阅读工具栏');
  syncToolbarExpandedBodyState();
}

function closeToolbar(force) {
  if (toolbarPinned && !force) return;
  closeReaderModePop();
  clearTimeout(toolbarCloseTimer);
  rTools.classList.remove('is-open');
  toolsHandle.setAttribute('aria-expanded', 'false');
  toolsHandle.setAttribute('aria-label', '展开阅读工具栏');
  syncToolbarExpandedBodyState();
  if (rTools.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur();
}

function scheduleToolbarClose() {
  clearTimeout(toolbarCloseTimer);
  if (!desktopToolbarQuery.matches || toolbarPinned || toolbarPanelOpen()) return;
  toolbarCloseTimer = setTimeout(function() {
    if (!toolbarPinned && !toolbarPanelOpen() && !rTools.matches(':hover') && !rTools.contains(document.activeElement)) {
      closeToolbar(false);
    }
  }, 420);
}

function setToolbarPinned(pinned, notify) {
  toolbarPinned = !!pinned;
  rTools.classList.toggle('is-pinned', toolbarPinned);
  toolsHandle.setAttribute('aria-pressed', toolbarPinned ? 'true' : 'false');
  if (toolbarPinned) {
    openToolbar();
    toolsHandle.setAttribute('aria-label', '取消固定阅读工具栏');
  } else {
    if (document.activeElement === toolsHandle) toolsHandle.blur();
    toolsHandle.setAttribute('aria-label', rTools.classList.contains('is-open') ? '固定阅读工具栏' : '展开阅读工具栏');
    scheduleToolbarClose();
  }
  if (notify && window.toast) {
    toast(toolbarPinned ? '工具栏已固定展开' : '工具栏已取消固定', 'success');
  }
}

rTools.addEventListener('mouseenter', function() {
  if (desktopToolbarQuery.matches) openToolbar();
});
rTools.addEventListener('mouseleave', function() {
  if (desktopToolbarQuery.matches) scheduleToolbarClose();
});
rTools.addEventListener('focusin', function(e) {
  if (desktopToolbarQuery.matches || e.target !== toolsHandle) openToolbar();
});
rTools.addEventListener('focusout', scheduleToolbarClose);
rTools.addEventListener('pointerdown', function() {
  if (desktopToolbarQuery.matches) openToolbar();
});
function activateToolbarHandle() {
  if (!rTools.classList.contains('is-open')) {
    openToolbar();
  } else {
    setToolbarPinned(!toolbarPinned, true);
  }
}

toolsHandle.addEventListener('click', function(e) {
  e.stopPropagation();
  activateToolbarHandle();
});
desktopToolbarQuery.addEventListener && desktopToolbarQuery.addEventListener('change', function() {
  setToolbarPinned(false, false);
  if (desktopToolbarQuery.matches) scheduleToolbarClose();
  else closeToolbar(true);
});
if (!desktopToolbarQuery.matches) closeToolbar(true);

// ---------- 更多功能按钮 (tMore) ----------
var tMore = document.getElementById('tMore');
var morePop = document.getElementById('morePop');
function closeMore() {
  morePop.classList.remove('show');
  tMore.classList.remove('active');
  tMore.setAttribute('aria-expanded', 'false');
  scheduleToolbarClose();
}
tMore.addEventListener('click', function(e) {
  this.blur();
  e.stopPropagation();
  var isShow = morePop.classList.toggle('show');
  tMore.classList.toggle('active', isShow);
  tMore.setAttribute('aria-expanded', isShow ? 'true' : 'false');
  if (isShow) { closeReaderModePop(); openToolbar(); closeJump(); } // open more, close jump
  else scheduleToolbarClose();
});

// ---------- 阅读方式与双页方向 ----------
function setReaderDirectionOpen(open, restoreFocus) {
  readerDirectionControl.hidden = !open;
  modeDoubleButton.setAttribute('aria-expanded', String(open));
  if (restoreFocus) modeDoubleButton.focus({ preventScroll: true });
}

function syncReaderModeControl() {
  readerModeTrigger.innerHTML = icon(readerModeIcons[readerMode]);
  readerModePop.querySelectorAll('[data-reader-mode]').forEach(function(button) {
    button.setAttribute('aria-pressed', String(button.dataset.readerMode === readerMode));
  });
  if (readerMode !== 'double') {
    var directionHadFocus = readerDirectionControl.contains(document.activeElement);
    setReaderDirectionOpen(false);
    if (directionHadFocus) readerModePop.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
}

function closeReaderModePop(restoreFocus) {
  if (readerModePop.hidden) return;
  setReaderDirectionOpen(false);
  readerModePop.hidden = true;
  readerModeTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) readerModeTrigger.focus({ preventScroll: true });
  scheduleToolbarClose();
}

readerModeTrigger.addEventListener('click', function(event) {
  if (!readerModePop.hidden) {
    closeReaderModePop(true);
    return;
  }
  closeMore();
  closeJump();
  openToolbar();
  readerModePop.hidden = false;
  readerModeTrigger.setAttribute('aria-expanded', 'true');
  if (event.detail === 0) {
    readerModePop.querySelector('[data-reader-mode="' + readerMode + '"]').focus({ preventScroll: true });
  }
});
readerModeTool.addEventListener('focusout', function(event) {
  if (event.relatedTarget && !readerModeTool.contains(event.relatedTarget)) closeReaderModePop();
});

// ---------- 顶部栏开关 (tHead) ----------
var tHead = document.getElementById('tHead');
var readerTop = document.querySelector('.reader-top');
var headHidden = localStorage.getItem('jmv-head-hidden') !== '0'; // default true
document.body.classList.toggle('reader-header-visible', !headHidden);
if (headHidden) {
  readerTop.classList.add('hidden');
  tHead.classList.toggle('active', !headHidden);
  tHead.setAttribute('aria-pressed', 'false');
} else {
  tHead.classList.toggle('active', !headHidden);
  tHead.setAttribute('aria-pressed', 'true');
}
document.documentElement.classList.remove('reader-header-prehidden');

function applyHeaderHidden(value, persist) {
  headHidden = !!value;
  readerTop.classList.toggle('hidden', headHidden);
  document.body.classList.toggle('reader-header-visible', !headHidden);
  tHead.classList.toggle('active', !headHidden);
  tHead.setAttribute('aria-pressed', headHidden ? 'false' : 'true');
  if (persist && window.JmvPrefs) JmvPrefs.set('headerHidden', headHidden);
}
tHead.addEventListener('click', function(e) {
  this.blur();
  // 阻止冒泡避免触发关闭 morePop
  e.stopPropagation();
  var willHide = !readerTop.classList.contains('hidden');
  preserveReaderViewport(function() {
    applyHeaderHidden(willHide, true);
  });
});
