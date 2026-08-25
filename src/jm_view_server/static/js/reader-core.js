var readerConfigElement = document.getElementById('readerConfig');
var readerConfig = JSON.parse(readerConfigElement.textContent);

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
document.getElementById('tSize').innerHTML = icon('fit');
document.getElementById('tAutoNext').innerHTML = icon('autoNext');
var tGridButton = document.getElementById('tGrid');
if (tGridButton) tGridButton.innerHTML = icon('grid');
// 搜原本图标
(function() {
  var links = document.querySelectorAll('.r-tools a, .more-pop a');
  links.forEach(function(a) {
    if (a.title === '原路返回' && !a.id) a.innerHTML = icon('arrowLeft');
    if (a.title === '搜原本') a.innerHTML = icon('search');
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

// 进度条视觉同步：独立监听 scroll，不依赖 common.js 对 pageselect 的赋值
// （common.js 用 .value = x 赋值不触发 attribute 变更，MutationObserver 拦不到）
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

function updateProgress(idx) {
  var p = Math.max(0, Math.min(TOTAL - 1, idx));
  if (fill) fill.style.width = (TOTAL > 1 ? (p / (TOTAL - 1) * 100) : 100).toFixed(0) + '%';
  if (curPage) curPage.textContent = '第 ' + (p + 1) + ' 页';
  if (topProg) topProg.textContent = String(p + 1).padStart(2, '0') + ' / ' + TOTAL;
  var bottomSelect = document.getElementById('pageselect');
  var toolSelect = document.getElementById('jumpSelect');
  if (bottomSelect) bottomSelect.value = String(p);
  if (toolSelect) toolSelect.value = String(p);
  updateInsertPageButtonState();
}

// 根据滚动位置计算当前页（与 common.js scroll 监听各自独立，不冲突）
function onScroll() {
  if (readerMode === 'double') {
    updateDoubleGroupFromScroll();
    return;
  }
  if (readerMode !== 'scroll') return;
  var mid = window.scrollY + window.innerHeight / 2;
  var best = 0;
  for (var i = 0; i < pages.length; i++) {
    var el = pages[i];
    if (el.offsetTop <= mid) best = i;
  }
  updateProgress(best);
}
window.addEventListener('scroll', onScroll, { passive: true });

// 点击进度条跳转
var ps = document.getElementById('pageselect');
var track = document.getElementById('track');
if (track) {
  track.onclick = function(e) {
    var r = e.currentTarget.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var targetIdx = Math.round(ratio * (TOTAL - 1));
    gotoPage(targetIdx);
  };
}

// Bug 修复：回到顶部。旧版此逻辑在 album.js（换皮丢弃 jquery 后没接上），
// 这里用原生 JS 复刻，点击平滑滚回顶部。
document.getElementById('gotop').addEventListener('click', function() {
  this.blur();
  if (isPagedMode()) gotoPage(0);
  else window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('gobottom').addEventListener('click', function() {
  if (isPagedMode()) gotoPage(pages.length - 1);
});

// 进度条开关：统一并入右侧工具栏（旧版割裂的 rClose/rReopen 已移除）。
// 进度条开关：显隐状态记忆到 localStorage['jmv-prog-hidden']，进入时恢复（默认开启）。
var tProg = document.getElementById('tProg');
var rBottom = document.getElementById('rBottom');

// 恢复状态
var hidden = localStorage.getItem('jmv-prog-hidden') === '1';
if (hidden) {
  rBottom.classList.add('hidden');
  tProg.classList.toggle('active', !hidden); // 开启态按钮高亮
} else {
  tProg.classList.toggle('active', !hidden);
}

tProg.addEventListener('click', function() {
  this.blur();
  var willHide = !rBottom.classList.contains('hidden');
  preserveReaderViewport(function() {
    rBottom.classList.toggle('hidden', willHide);
    tProg.classList.toggle('active', !willHide);
    try { localStorage.setItem('jmv-prog-hidden', willHide ? '1' : '0'); } catch (e) {}
  });
});

// 项2：工具栏“跳转页码”——贴附工具栏的原地浮窗（非全屏 modal，参考旧版直白交互）。
// 页码用下拉选择（同底部进度条 pageselect），选中即跳页并收起浮窗；点外部/Esc 收起。
var tJump = document.getElementById('tJump');
var jumpPop = document.getElementById('jumpPop');
var jumpSelect = document.getElementById('jumpSelect'); // <select>，value 为 0-based 页索引

function currentPageIdx() {
  if (readerMode !== 'scroll') return activePageIndex;
  // 以当前进度（顶部进度显示同源）作为下拉默认选中项
  var mid = window.scrollY + window.innerHeight / 2, best = 0;
  for (var i = 0; i < pages.length; i++) { if (pages[i].offsetTop <= mid) best = i; }
  return best;
}
function openJump() {
  jumpSelect.value = String(currentPageIdx());
  jumpPop.classList.add('show');
  openToolbar();
}
function closeJump() {
  jumpPop.classList.remove('show');
  scheduleToolbarClose();
}
function closeSize() {
  if (sizePop) {
    sizePop.classList.remove('show');
    tSize.classList.remove('active');
  }
  scheduleToolbarClose();
}

tJump.addEventListener('click', function(e) {
  e.stopPropagation();
  if (jumpPop.classList.contains('show')) closeJump(); else { openJump(); closeSize(); }
});
// 选中即跳页并收起浮窗
jumpSelect.addEventListener('change', function() {
  var idx = parseInt(jumpSelect.value, 10); // 下拉选项天然合法
  closeJump();
  gotoPage(idx);
});
if (ps) {
  ps.addEventListener('change', function() {
    if (readerMode !== 'scroll') gotoPage(parseInt(ps.value, 10));
  });
}
// 点击浮窗外部收起（点浮窗内部不关，以免影响下拉展开）
document.addEventListener('click', function(e) {
  if (jumpPop.classList.contains('show') && !jumpPop.contains(e.target) && e.target !== tJump) closeJump();
  if (sizePop && sizePop.classList.contains('show') && !sizePop.contains(e.target) && e.target !== tSize) closeSize();
  if (morePop.classList.contains('show') && !morePop.contains(e.target) && e.target !== tMore) closeMore();
  if (rTools && !desktopToolbarQuery.matches && rTools.classList.contains('is-open') && !rTools.contains(e.target)) {
    closeToolbar(true);
  }
});
var rTools = document.querySelector('.r-tools');
var toolsHandle = document.getElementById('toolsHandle');
var desktopToolbarQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
var toolbarCloseTimer = null;
var toolbarPinned = false;

function toolbarPanelOpen() {
  return jumpPop.classList.contains('show') ||
    (sizePop && sizePop.classList.contains('show')) ||
    (morePop && morePop.classList.contains('show'));
}

function openToolbar() {
  clearTimeout(toolbarCloseTimer);
  rTools.classList.add('is-open');
  toolsHandle.setAttribute('aria-expanded', 'true');
  toolsHandle.setAttribute('aria-label', desktopToolbarQuery.matches ? '固定阅读工具栏' : '收起阅读工具栏');
}

function closeToolbar(force) {
  clearTimeout(toolbarCloseTimer);
  if (toolbarPinned && !force) return;
  rTools.classList.remove('is-open');
  toolsHandle.setAttribute('aria-expanded', 'false');
  toolsHandle.setAttribute('aria-label', '展开阅读工具栏');
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
  toolbarPinned = desktopToolbarQuery.matches && !!pinned;
  rTools.classList.toggle('is-pinned', toolbarPinned);
  toolsHandle.setAttribute('aria-pressed', toolbarPinned ? 'true' : 'false');
  if (toolbarPinned) {
    openToolbar();
    toolsHandle.setAttribute('aria-label', '恢复工具栏自动收起');
  } else {
    if (document.activeElement === toolsHandle) toolsHandle.blur();
    toolsHandle.setAttribute('aria-label', rTools.classList.contains('is-open') ? '固定阅读工具栏' : '展开阅读工具栏');
    scheduleToolbarClose();
  }
  if (notify && window.toast) {
    toast(toolbarPinned ? '工具栏已固定展开' : '工具栏已恢复悬停收起', 'success');
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
toolsHandle.addEventListener('click', function(e) {
  e.stopPropagation();
  if (desktopToolbarQuery.matches) {
    setToolbarPinned(!toolbarPinned, true);
  } else if (rTools.classList.contains('is-open')) {
    closeJump();
    closeSize();
    closeMore();
    closeToolbar(true);
  } else {
    openToolbar();
  }
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
  scheduleToolbarClose();
}
tMore.addEventListener('click', function(e) {
  this.blur();
  e.stopPropagation();
  var isShow = morePop.classList.toggle('show');
  tMore.classList.toggle('active', isShow);
  if (isShow) { openToolbar(); closeJump(); } // open more, close jump
  else scheduleToolbarClose();
});

// ---------- 顶部栏开关 (tHead) ----------
var tHead = document.getElementById('tHead');
var readerTop = document.querySelector('.reader-top');
var headHidden = localStorage.getItem('jmv-head-hidden') !== '0'; // default true
document.body.classList.toggle('reader-header-visible', !headHidden);
if (headHidden) {
  readerTop.classList.add('hidden');
  tHead.classList.toggle('active', !headHidden);
} else {
  tHead.classList.toggle('active', !headHidden);
}
tHead.addEventListener('click', function(e) {
  this.blur();
  // 阻止冒泡避免触发关闭 morePop
  e.stopPropagation();
  var willHide = !readerTop.classList.contains('hidden');
  preserveReaderViewport(function() {
    readerTop.classList.toggle('hidden', willHide);
    document.body.classList.toggle('reader-header-visible', !willHide);
    tHead.classList.toggle('active', !willHide);
    try { localStorage.setItem('jmv-head-hidden', willHide ? '1' : '0'); } catch (e) {}
  });
});
