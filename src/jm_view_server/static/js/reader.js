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
  if (isFull) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  } else {
    if (doc.requestFullscreen) doc.requestFullscreen();
    else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen();
    else if (doc.msRequestFullscreen) doc.msRequestFullscreen();
    else if (window.toast) toast('当前浏览器不支持全屏API');
  }
};

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

// 初始化进度
updateProgress(0);

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
    tHead.classList.toggle('active', !willHide);
    try { localStorage.setItem('jmv-head-hidden', willHide ? '1' : '0'); } catch (e) {}
  });
});

/* ============================================================
   新增阅读增强功能（纯前端，均记 localStorage，key 前缀 jmv-）
   ============================================================ */

// 相册标识：优先用标题，作为 localStorage key 的一部分
var ALBUM_ID = readerConfig.albumId;
var PROGRESS_KEY = 'jmv-progress:' + ALBUM_ID;

var stream = document.getElementById('stream');
// 默认使用适宽
stream.classList.add('fit-width');

// ---------- 项9：护眼滤镜（暖光，切换并记忆） ----------
function applyEye(on) {
  stream.classList.toggle('eye-care', !!on);
  document.body.classList.toggle('reader-eye-care', !!on);
  document.getElementById('tEye').classList.toggle('active', !!on);
  if (window.JmvPrefs) JmvPrefs.set('eyeCare', !!on);
  else try { localStorage.setItem('jmv-eyecare', on ? '1' : '0'); } catch (e) {}
}
applyEye(window.JmvPrefs ? JmvPrefs.get('eyeCare') : (function(){ try { return localStorage.getItem('jmv-eyecare') === '1'; } catch(e){ return false; } })());
document.getElementById('tEye').addEventListener('click', function() {
  this.blur();
  applyEye(!stream.classList.contains('eye-care'));
});

// ---------- 自定义图片大小滑动条重构（横向独立浮窗） ----------
var tSize = document.getElementById('tSize');
var sizePop = document.getElementById('sizePop');
var sizeRange = document.getElementById('tSizeRange');
var sizeVal = document.getElementById('tSizeVal');
var sizeReset = document.getElementById('tSizeReset');
var sizeRangeControl = document.getElementById('sizeRangeControl');
var doubleWidthScaleControl = document.getElementById('doubleWidthScaleControl');
var doubleWidthScaleRange = document.getElementById('doubleWidthScaleRange');
var doubleWidthScaleValue = document.getElementById('doubleWidthScaleValue');

function syncSizeControls() {
  var isDouble = readerMode === 'double';
  if (sizePop) sizePop.classList.toggle('is-double-scale', isDouble);
  if (sizeRangeControl) sizeRangeControl.hidden = isDouble;
  if (doubleWidthScaleControl) doubleWidthScaleControl.hidden = !isDouble;
  if (doubleWidthScaleRange) doubleWidthScaleRange.value = String(doubleWidthScale);
  if (doubleWidthScaleValue) doubleWidthScaleValue.textContent = formatDoubleWidthScale(doubleWidthScale);
  if (sizeVal) sizeVal.hidden = isDouble;
  if (!sizeVal || isDouble) return;
  sizeVal.textContent = singleFit === 'contain' ? '适应' : (sizeRange ? sizeRange.value + 'px' : '800px');
}

function applyDoubleWidthScale(value, persist) {
  var viewportSnapshot = persist ? captureReaderViewport() : null;
  var parsedScale = parseInt(value, 10);
  doubleWidthScale = Math.max(50, Math.min(100, isNaN(parsedScale) ? 98 : parsedScale));
  var breathingRoom = 100 - doubleWidthScale;
  stream.style.setProperty('--reader-double-width-scale', String(doubleWidthScale));
  stream.style.setProperty('--reader-double-width-breathing-inline', (breathingRoom / 2) + 'vw');
  stream.style.setProperty('--reader-double-width-breathing-block', (breathingRoom / 2) + 'vh');
  syncSizeControls();
  if (persist) {
    if (window.JmvPrefs) JmvPrefs.set('doubleWidthScale', doubleWidthScale);
    else try { localStorage.setItem('jmv-double-width-scale', String(doubleWidthScale)); } catch (e) {}
  }
  restoreReaderViewport(viewportSnapshot);
}

function applySingleFit(mode, persist) {
  singleFit = mode === 'custom' ? 'custom' : 'contain';
  stream.classList.toggle('reader-single-custom', singleFit === 'custom');
  syncSizeControls();
  if (persist) {
    if (window.JmvPrefs) JmvPrefs.set('singleFit', singleFit);
    else try { localStorage.setItem('jmv-single-fit', singleFit); } catch (e) {}
  }
}

function applyImageSize(val, isInit) {
  var viewportSnapshot = isInit ? null : captureReaderViewport();
  var v = Math.max(300, Math.min(1600, parseInt(val, 10) || 800));
  
  // 动态调节图片容器最大宽度
  stream.style.maxWidth = v + 'px';
  stream.style.setProperty('--reader-custom-width', v + 'px');
  
  // 同步滑块及文字显示
  if (sizeRange) sizeRange.value = String(v);
  if (sizeVal && readerMode !== 'double') sizeVal.textContent = singleFit === 'contain' && isInit ? '适应' : v + 'px';
  
  if (window.JmvPrefs) JmvPrefs.set('imageSize', v);
  else try { localStorage.setItem('jmv-img-custom-size', String(v)); } catch (e) {}
  if (!isInit) applySingleFit('custom', true);
  restoreReaderViewport(viewportSnapshot);
}

if (tSize && sizePop) {
  tSize.addEventListener('click', function(e) {
    this.blur();
    e.stopPropagation();
    var isShow = sizePop.classList.toggle('show');
    tSize.classList.toggle('active', isShow);
    if (isShow) {
      closeJump();
    }
  });
}

if (sizeRange) {
  sizeRange.addEventListener('input', function() {
    applyImageSize(sizeRange.value, false);
  });
  sizeRange.addEventListener('dblclick', function(e) { e.stopPropagation(); });
  sizeRange.addEventListener('touchstart', function(e) { e.stopPropagation(); }, {passive:true});
  sizeRange.addEventListener('touchmove', function(e) { e.stopPropagation(); }, {passive:true});
}

if (doubleWidthScaleRange) {
  doubleWidthScaleRange.addEventListener('input', function(e) {
    e.stopPropagation();
    applyDoubleWidthScale(doubleWidthScaleRange.value, true);
  });
  doubleWidthScaleRange.addEventListener('dblclick', function(e) { e.stopPropagation(); });
  doubleWidthScaleRange.addEventListener('touchstart', function(e) { e.stopPropagation(); }, {passive:true});
  doubleWidthScaleRange.addEventListener('touchmove', function(e) { e.stopPropagation(); }, {passive:true});
}

if (sizeReset) {
  sizeReset.addEventListener('click', function(e) {
    e.stopPropagation();
    if (readerMode === 'double') {
      preserveReaderViewport(function() {
        applyDoubleWidthScale(98, true);
      });
      if (window.toast) {
        toast('双页画面比例已恢复为 98%', 'success');
      }
      return;
    }
    applyImageSize(800, true);
    applySingleFit('contain', true);
    if (window.toast) {
      toast('已恢复适应屏幕', 'success');
    }
  });
}

// 恢复状态
(function initCustomImageSize() {
  var saved = window.JmvPrefs ? JmvPrefs.get('imageSize') : 800;
  applyImageSize(saved, true);
  applySingleFit(singleFit, false);
  applyDoubleWidthScale(doubleWidthScale, false);
})();

// ---------- 自动连播下一本逻辑 ----------
var NEXT_DIR_PATH = readerConfig.nextDirPath;
var OPEN_FROM_DIR = readerConfig.openFromDir;

var tAutoNext = document.getElementById('tAutoNext');
var isAutoNext = localStorage.getItem('jmv-auto-next') === '1'; // 默认关闭

function setAutoNext(on) {
  isAutoNext = !!on;
  if (tAutoNext) tAutoNext.classList.toggle('active', isAutoNext);
  try { localStorage.setItem('jmv-auto-next', isAutoNext ? '1' : '0'); } catch(e) {}
}

setAutoNext(isAutoNext);

if (tAutoNext) {
  tAutoNext.addEventListener('click', function(e) {
    this.blur();
    e.stopPropagation();
    setAutoNext(!isAutoNext);
    if (window.toast) {
      toast(isAutoNext ? '已开启连播下一本' : '已关闭连播下一本', 'success');
    }
  });
}

var autoJumpTimer = null;
var countdownSec = 2;
var jumpBar = null;
var isCancelledThisTime = false;
var isLoadingNextAlbum = false;

function checkTouchBottom() {
  if (!isAutoNext || !NEXT_DIR_PATH || isCancelledThisTime || isLoadingNextAlbum) return;
  
  var threshold = 80;
  var isBottom = (window.innerHeight + window.scrollY >= document.body.offsetHeight - threshold);
  
  if (isBottom) {
    if (!autoJumpTimer && !jumpBar) {
      showJumpCountdown();
    }
  } else {
    if (jumpBar && !autoJumpTimer) {
      // 已开始加载，无需处理
    } else {
      cancelJump();
    }
  }
}

function showJumpCountdown() {
  countdownSec = 2;
  isCancelledThisTime = false;
  
  jumpBar = document.createElement('div');
  jumpBar.className = 'resume-bar';
  jumpBar.style.top = 'auto';
  jumpBar.style.bottom = '100px';
  jumpBar.style.transform = 'translateX(-50%) translateY(12px)';
  
  jumpBar.innerHTML = '<span style="overflow:hidden;text-overflow:ellipsis">即将连播下本: <b>' + countdownSec + 's</b></span>' +
                      '<button class="resume-go" style="background:var(--brand); color:#fff; border:none; border-radius:var(--r-pill); font-size:13px; font-weight:500; height:32px; padding:0 16px; cursor:pointer;">立即进入</button>' +
                      '<button class="resume-close" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:18px; padding:0 8px;">✕</button>';
                      
  document.body.appendChild(jumpBar);
  
  requestAnimationFrame(function() {
    jumpBar.classList.add('show');
    jumpBar.style.transform = 'translateX(-50%) translateY(0)';
  });
  
  autoJumpTimer = setInterval(function() {
    countdownSec--;
    if (countdownSec <= 0) {
      clearInterval(autoJumpTimer);
      autoJumpTimer = null;
      loadNextAlbum();
    } else {
      var numEl = jumpBar.querySelector('b');
      if (numEl) numEl.textContent = countdownSec + 's';
    }
  }, 1000);
  
  jumpBar.querySelector('.resume-go').addEventListener('click', function(e) {
    e.stopPropagation();
    clearInterval(autoJumpTimer);
    autoJumpTimer = null;
    loadNextAlbum();
  });
  
  jumpBar.querySelector('.resume-close').addEventListener('click', function(e) {
    e.stopPropagation();
    isCancelledThisTime = true;
    cancelJump();
  });
}

function cancelJump() {
  if (autoJumpTimer) {
    clearInterval(autoJumpTimer);
    autoJumpTimer = null;
  }
  if (jumpBar) {
    var targetBar = jumpBar;
    jumpBar = null;
    targetBar.classList.remove('show');
    targetBar.style.transform = 'translateX(-50%) translateY(12px)';
    setTimeout(function() { targetBar.remove(); }, 200);
  }
}

window.addEventListener('scroll', function() {
  var threshold = 180;
  var nearBottom = (window.innerHeight + window.scrollY >= document.body.offsetHeight - threshold);
  if (!nearBottom) {
    isCancelledThisTime = false;
  }
  checkTouchBottom();
}, { passive: true });

function loadNextAlbum() {
  if (isLoadingNextAlbum || !NEXT_DIR_PATH) return;
  isLoadingNextAlbum = true;
  
  if (jumpBar) {
    jumpBar.querySelector('span').innerHTML = '正在加载下一本...';
    var goBtn = jumpBar.querySelector('.resume-go');
    if (goBtn) goBtn.style.display = 'none';
    var closeBtn = jumpBar.querySelector('.resume-close');
    if (closeBtn) closeBtn.style.display = 'none';
  }
  
  fetch('/api/jm_images?path=' + NEXT_DIR_PATH)
    .then(function(res) { return res.json(); })
    .then(function(res) {
      isLoadingNextAlbum = false;
      if (res.status === 'ok') {
        appendNextAlbumData(res);
        cancelJump();
        if (window.toast) {
          toast('已连播下一本：《' + res.title + '》', 'success');
        }
      } else {
        cancelJump();
        if (window.toast) toast('载入下一本失败', 'error');
      }
    })
    .catch(function(err) {
      isLoadingNextAlbum = false;
      cancelJump();
      if (window.toast) toast('加载下一本失败，网络错误', 'error');
    });
}

function appendNextAlbumData(res) {
  var streamEl = document.getElementById('stream');
  if (!streamEl) return;
  
  var startIdx = TOTAL;
  var newImagesCount = res.images.length;
  var wasAtPagedEnd = isPagedMode() && activePageIndex === startIdx - 1;
  
  res.images.forEach(function(imgData, localIdx) {
    var globalIdx = startIdx + localIdx;
    var container = document.createElement('div');
    container.className = 'center scramble-page';
    container.id = 'page_' + globalIdx;
    container.setAttribute('data-page', String(globalIdx));
    
    var img = document.createElement('img');
    img.className = 'lazyload page-img';
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.setAttribute('data-src', imgData.data_original);
    img.setAttribute('data-original', imgData.data_original);
    img.alt = '第 ' + (globalIdx + 1) + ' 页';
    
    container.appendChild(img);
    streamEl.appendChild(container);
  });
  
  var newObserver = new IntersectionObserver(function(entries, observerInstance) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var img = entry.target;
        img.src = img.getAttribute("data-src");
        img.classList.remove("lazyload");
        observerInstance.unobserve(img);
      }
    });
  });
  for (var i = startIdx; i < startIdx + newImagesCount; i++) {
    var imgEl = document.querySelector('#page_' + i + ' .lazyload');
    if (imgEl) newObserver.observe(imgEl);
  }
  
  TOTAL = startIdx + newImagesCount;
  pages = document.querySelectorAll('.scramble-page');
  NEXT_DIR_PATH = res.next_dir_path;
  
  ALBUM_RANGES.push({
    start: startIdx,
    end: startIdx + newImagesCount - 1,
    key: 'jmv-progress:' + res.title,
    title: res.title
  });
  
  var ps = document.getElementById('pageselect');
  if (ps) {
    for (var i = 0; i < newImagesCount; i++) {
      var pageNum = startIdx + i + 1;
      var opt = document.createElement('option');
      opt.value = String(startIdx + i);
      opt.textContent = pageNum + '/' + TOTAL;
      ps.appendChild(opt);
    }
  }
  
  var js = document.getElementById('jumpSelect');
  if (js) {
    for (var i = 0; i < newImagesCount; i++) {
      var pageNum = startIdx + i + 1;
      var opt = document.createElement('option');
      opt.value = String(startIdx + i);
      opt.textContent = '第 ' + pageNum + ' / ' + TOTAL + ' 页';
      js.appendChild(opt);
    }
  }
  rebuildReaderGrid();
  rebuildDoubleGroups(activePageIndex, { scroll: false });
  if (wasAtPagedEnd) gotoPage(startIdx);
}

// ---------- 图片临时旋转：按住图片后从四扇区菜单选择方向 ----------
function setImageRotation(img, deg) {
  deg = parseInt(deg, 10) || 0;
  img.dataset.rotate = String(deg);
  img.style.transform = 'rotate(' + deg + 'deg)';
}

var rotateRadial = document.getElementById('rotateRadial');
var rotateTarget = null;
var rotateHoldTimer = null;
var rotateHoldStart = null;
var suppressPageClickUntil = 0;

function closeRotateRadial() {
  if (!rotateRadial) return;
  rotateRadial.classList.remove('show');
  rotateRadial.setAttribute('aria-hidden', 'true');
  rotateRadial.setAttribute('inert', '');
  rotateRadial.querySelectorAll('[data-rotate]').forEach(function(button) { button.tabIndex = -1; });
  rotateTarget = null;
}

function openRotateRadial(img, clientX, clientY) {
  if (!rotateRadial || !img) return;
  rotateTarget = img;
  var radius = rotateRadial.offsetWidth / 2 || 88;
  var margin = 12;
  rotateRadial.style.left = Math.max(radius + margin, Math.min(window.innerWidth - radius - margin, clientX)) + 'px';
  rotateRadial.style.top = Math.max(radius + margin, Math.min(window.innerHeight - radius - margin, clientY)) + 'px';
  var current = String(parseInt(img.dataset.rotate || '0', 10) % 360);
  rotateRadial.querySelectorAll('[data-rotate]').forEach(function(button) {
    button.setAttribute('aria-checked', button.dataset.rotate === current ? 'true' : 'false');
    button.tabIndex = 0;
  });
  rotateRadial.removeAttribute('inert');
  rotateRadial.classList.add('show');
  rotateRadial.setAttribute('aria-hidden', 'false');
}

function cancelRotateHold() {
  clearTimeout(rotateHoldTimer);
  rotateHoldTimer = null;
  rotateHoldStart = null;
}

stream.addEventListener('pointerdown', function(e) {
  var img = e.target.closest ? e.target.closest('.page-img') : null;
  if (!img || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  cancelRotateHold();
  rotateHoldStart = { x: e.clientX, y: e.clientY };
  rotateHoldTimer = setTimeout(function() {
    suppressPageClickUntil = Date.now() + 700;
    openRotateRadial(img, e.clientX, e.clientY);
    if (e.pointerType !== 'mouse' && navigator.vibrate) navigator.vibrate(35);
    rotateHoldTimer = null;
  }, e.pointerType === 'mouse' ? 520 : 650);
});
stream.addEventListener('pointermove', function(e) {
  if (!rotateHoldStart) return;
  if (Math.hypot(e.clientX - rotateHoldStart.x, e.clientY - rotateHoldStart.y) > 10) cancelRotateHold();
});
stream.addEventListener('pointerup', cancelRotateHold);
stream.addEventListener('pointercancel', cancelRotateHold);
stream.addEventListener('dragstart', function(e) {
  if (e.target.closest && e.target.closest('.page-img')) e.preventDefault();
});

if (rotateRadial) {
  rotateRadial.querySelectorAll('[data-rotate]').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.stopPropagation();
      if (rotateTarget) setImageRotation(rotateTarget, button.dataset.rotate);
      closeRotateRadial();
    });
  });
}
document.addEventListener('pointerdown', function(e) {
  if (rotateRadial && rotateRadial.classList.contains('show') && !rotateRadial.contains(e.target)) closeRotateRadial();
});

// ---------- 阅读模式、点击翻页与键盘快捷键 ----------
function inEditable(t) {
  if (!t) return false;
  var tag = t.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
}

function ensurePageLoaded(idx) {
  if (idx < 0 || idx >= pages.length) return;
  var img = pages[idx].querySelector('.page-img');
  if (!img) return;
  var source = img.getAttribute('data-src');
  if (source && img.classList.contains('lazyload')) {
    img.src = source;
    img.classList.remove('lazyload');
  }
}

function isPagedMode() {
  return readerMode === 'single';
}

function isWidePage(idx) {
  if (idx < 0 || idx >= pages.length) return false;
  var img = pages[idx].querySelector('.page-img');
  if (!img) return false;
  if (img.dataset.readerWide === '1') return true;
  if (img.dataset.readerWide === '0') return false;
  return !!(img.complete && img.naturalHeight && img.naturalWidth / img.naturalHeight >= 1.2);
}

function getAlbumRangesForGrouping() {
  if (typeof ALBUM_RANGES !== 'undefined' && ALBUM_RANGES && ALBUM_RANGES.length) return ALBUM_RANGES;
  return pages.length ? [{ start: 0, end: pages.length - 1 }] : [];
}

function pushDoublePair(groups, firstIdx, secondIdx) {
  var physicalSlots = readingDirection === 'rtl' ? [secondIdx, firstIdx] : [firstIdx, secondIdx];
  groups.push({
    pages: secondIdx === null ? [firstIdx] : [firstIdx, secondIdx],
    slots: physicalSlots,
    anchor: firstIdx,
    kind: secondIdx === null ? 'single' : 'pair'
  });
}

function buildDoubleGroups() {
  var groups = [];
  getAlbumRangesForGrouping().forEach(function(range) {
    var start = Math.max(0, range.start);
    var end = Math.min(pages.length - 1, range.end);
    if (start > end) return;

    var cursor = start;
    if (!isWidePage(cursor)) {
      groups.push({
        pages: [cursor],
        slots: readingDirection === 'rtl' ? [cursor, null] : [null, cursor],
        anchor: cursor,
        kind: 'cover'
      });
      cursor += 1;
    }

    var pending = null;
    for (; cursor <= end; cursor++) {
      if (isWidePage(cursor)) {
        if (pending !== null) {
          pushDoublePair(groups, pending, null);
          pending = null;
        }
        groups.push({ pages: [cursor], slots: [cursor, cursor], anchor: cursor, kind: 'wide' });
      } else if (pending === null) {
        pending = cursor;
      } else {
        pushDoublePair(groups, pending, cursor);
        pending = null;
      }
    }
    if (pending !== null) pushDoublePair(groups, pending, null);
  });
  return groups;
}

function findDoubleGroupIndex(pageIdx) {
  for (var i = 0; i < doubleGroups.length; i++) {
    if (doubleGroups[i].pages.indexOf(pageIdx) !== -1) return i;
  }
  return Math.max(0, Math.min(doubleGroups.length - 1, activeDoubleGroupIndex));
}

function clearDoublePageState(page) {
  page.classList.remove('is-double-active', 'is-double-current', 'is-double-left', 'is-double-right', 'is-double-wide', 'is-double-cover', 'is-wide-page');
  page.removeAttribute('data-double-slot');
  page.removeAttribute('data-double-group');
  page.style.removeProperty('--reader-double-column');
  page.style.removeProperty('--reader-double-row');
  page.style.removeProperty('grid-column');
  page.style.removeProperty('grid-row');
}

function removeDoubleBlankSlots() {
  doubleBlankSlots.forEach(function(slot) {
    if (slot.parentNode) slot.parentNode.removeChild(slot);
  });
  doubleBlankSlots = [];
}

function createDoubleBlankSlot(groupIndex, slot) {
  var blankSlot = document.createElement('div');
  blankSlot.className = 'reader-double-blank';
  blankSlot.setAttribute('aria-hidden', 'true');
  blankSlot.dataset.doubleGroup = String(groupIndex);
  blankSlot.dataset.doubleSlot = slot;
  blankSlot.style.setProperty('--reader-double-column', slot === 'left' ? '1' : '2');
  blankSlot.style.setProperty('--reader-double-row', String(groupIndex + 1));
  blankSlot.style.gridColumn = slot === 'left' ? '1' : '2';
  blankSlot.style.gridRow = String(groupIndex + 1);
  stream.appendChild(blankSlot);
  doubleBlankSlots.push(blankSlot);
}

function setDoubleContinuousLayout(enabled) {
  if (enabled) {
    if (!doubleLayoutOriginalStyles) {
      doubleLayoutOriginalStyles = {
        bodyOverflow: document.body.style.overflow,
        streamHeight: stream.style.height,
        streamMinHeight: stream.style.minHeight,
        streamOverflow: stream.style.overflow,
        streamGridTemplateRows: stream.style.gridTemplateRows,
        streamGridAutoRows: stream.style.gridAutoRows,
        streamRowGap: stream.style.rowGap,
        streamDirection: stream.style.direction
      };
    }
    document.body.style.overflow = 'auto';
    stream.style.height = 'auto';
    stream.style.minHeight = '100vh';
    stream.style.overflow = 'visible';
    stream.style.gridTemplateRows = 'none';
    stream.style.gridAutoRows = 'auto';
    stream.style.rowGap = '0px';
    stream.style.direction = 'ltr';
  } else {
    var original = doubleLayoutOriginalStyles || {};
    document.body.style.overflow = original.bodyOverflow || '';
    stream.style.height = original.streamHeight || '';
    stream.style.minHeight = original.streamMinHeight || '';
    stream.style.overflow = original.streamOverflow || '';
    stream.style.gridTemplateRows = original.streamGridTemplateRows || '';
    stream.style.gridAutoRows = original.streamGridAutoRows || '';
    stream.style.rowGap = original.streamRowGap || '';
    stream.style.direction = original.streamDirection || '';
    doubleLayoutOriginalStyles = null;
  }
}

function renderDoubleGroups() {
  removeDoubleBlankSlots();
  pages.forEach(function(page) {
    page.classList.remove('is-active');
    clearDoublePageState(page);
  });

  doubleGroups.forEach(function(group, groupIndex) {
    group.pages.forEach(function(pageIdx) {
      var page = pages[pageIdx];
      if (!page) return;
      page.classList.add('is-double-active');
      page.dataset.doubleGroup = String(groupIndex);
      page.style.setProperty('--reader-double-row', String(groupIndex + 1));
      page.style.gridRow = String(groupIndex + 1);
      if (group.kind === 'wide') {
        page.classList.add('is-double-wide', 'is-wide-page');
        page.style.gridColumn = '1 / -1';
        return;
      }
      if (group.kind === 'cover') page.classList.add('is-double-cover');
      var slot = group.slots[0] === pageIdx ? 'left' : 'right';
      page.dataset.doubleSlot = slot;
      page.style.setProperty('--reader-double-column', slot === 'left' ? '1' : '2');
      page.style.gridColumn = slot === 'left' ? '1' : '2';
      page.classList.add(slot === 'left' ? 'is-double-left' : 'is-double-right');
    });

    if (group.kind === 'single' || group.kind === 'cover') {
      createDoubleBlankSlot(groupIndex, group.slots[0] === null ? 'left' : 'right');
    }
  });
}

function preloadDoubleGroups(groupIndex) {
  [groupIndex - 1, groupIndex, groupIndex + 1].forEach(function(idx) {
    var preloadGroup = doubleGroups[idx];
    if (!preloadGroup) return;
    preloadGroup.pages.forEach(ensurePageLoaded);
  });
}

function setActiveDoubleGroup(groupIndex, preferredPageIdx, persist) {
  if (!doubleGroups.length) return;
  activeDoubleGroupIndex = Math.max(0, Math.min(doubleGroups.length - 1, groupIndex));
  var group = doubleGroups[activeDoubleGroupIndex];
  activePageIndex = group.pages.indexOf(preferredPageIdx) !== -1 ? preferredPageIdx : group.anchor;
  pages.forEach(function(page) { page.classList.remove('is-double-current'); });
  group.pages.forEach(function(pageIdx) {
    if (pages[pageIdx]) pages[pageIdx].classList.add('is-double-current');
  });
  preloadDoubleGroups(activeDoubleGroupIndex);
  updateProgress(activePageIndex);
  updateGridCurrentPage();
  if (persist !== false) saveCurrentProgress(activePageIndex);
}

function doubleGroupElement(groupIndex) {
  var group = doubleGroups[groupIndex];
  return group && pages[group.pages[0]] ? pages[group.pages[0]] : null;
}

function scrollToDoubleGroup(groupIndex, behavior) {
  var target = doubleGroupElement(groupIndex);
  if (!target) return;
  target.scrollIntoView({ behavior: behavior || 'smooth', block: 'center' });
}

function updateDoubleGroupFromScroll() {
  if (readerMode !== 'double' || !doubleGroups.length) return;
  var viewportCenter = window.innerHeight / 2;
  var bestGroupIndex = activeDoubleGroupIndex;
  var bestDistance = Infinity;
  doubleGroups.forEach(function(group, groupIndex) {
    var element = doubleGroupElement(groupIndex);
    if (!element) return;
    var rect = element.getBoundingClientRect();
    var distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestGroupIndex = groupIndex;
    }
  });
  if (bestGroupIndex !== activeDoubleGroupIndex) {
    setActiveDoubleGroup(bestGroupIndex, doubleGroups[bestGroupIndex].anchor, false);
  }
}

function rebuildDoubleGroups(preferredPageIdx, options) {
  options = options || {};
  var keepIndex = typeof preferredPageIdx === 'number' ? preferredPageIdx : activePageIndex;
  var anchorElement = readerMode === 'double' ? pages[keepIndex] : null;
  var anchorTop = anchorElement ? anchorElement.getBoundingClientRect().top : null;
  doubleGroups = buildDoubleGroups();
  activeDoubleGroupIndex = findDoubleGroupIndex(keepIndex);
  if (readerMode !== 'double') return;
  setDoubleContinuousLayout(true);
  renderDoubleGroups();
  setActiveDoubleGroup(activeDoubleGroupIndex, keepIndex, false);
  if (options.scroll !== false) {
    requestAnimationFrame(function() {
      scrollToDoubleGroup(activeDoubleGroupIndex, options.behavior || 'auto');
    });
  } else if (anchorTop !== null && pages[keepIndex]) {
    requestAnimationFrame(function() {
      var newTop = pages[keepIndex].getBoundingClientRect().top;
      window.scrollBy(0, newTop - anchorTop);
    });
  }
}

function cleanupDoubleLayout() {
  removeDoubleBlankSlots();
  setDoubleContinuousLayout(false);
  pages.forEach(function(page) {
    page.classList.remove('is-active');
    clearDoublePageState(page);
  });
}

function applyDoubleGroup(groupIndex, preferredPageIdx) {
  if (!doubleGroups.length) return;
  setActiveDoubleGroup(groupIndex, preferredPageIdx, true);
  scrollToDoubleGroup(activeDoubleGroupIndex, 'smooth');
}

function scheduleDoubleGroupRebuild() {
  clearTimeout(doubleRebuildTimer);
  doubleRebuildTimer = setTimeout(function() {
    rebuildDoubleGroups(activePageIndex, { scroll: false });
  }, 0);
}

function updateImagePageType(img) {
  if (!img || !img.naturalHeight) return;
  var wide = img.naturalWidth / img.naturalHeight >= 1.2 ? '1' : '0';
  if (img.dataset.readerWide === wide) return;
  img.dataset.readerWide = wide;
  scheduleDoubleGroupRebuild();
}

stream.addEventListener('load', function(e) {
  if (e.target && e.target.classList && e.target.classList.contains('page-img')) updateImagePageType(e.target);
}, true);
pages.forEach(function(page) {
  var img = page.querySelector('.page-img');
  if (img && img.complete) updateImagePageType(img);
});

function saveCurrentProgress(idx) {
  if (!ALBUM_RANGES) return;
  for (var i = 0; i < ALBUM_RANGES.length; i++) {
    var range = ALBUM_RANGES[i];
    if (idx >= range.start && idx <= range.end) {
      try { localStorage.setItem(range.key, String(idx - range.start)); } catch (e) {}
      return;
    }
  }
}

function showSingleReaderTip() {
  try {
    if (localStorage.getItem('jmv-onboarding-single-v1') === '1') return;
    localStorage.setItem('jmv-onboarding-single-v1', '1');
  } catch (e) {}
  if (window.toast) toast('单页模式：点击图片左右翻页，按方向键翻页，按 ? 查看帮助', 'success');
}

function setReaderMode(mode, options) {
  options = options || {};
  var nextMode = mode === 'single' || mode === 'double' ? mode : 'scroll';
  var keepIndex = currentPageIdx();
  var previousMode = readerMode;
  readerMode = nextMode;
  activePageIndex = Math.max(0, Math.min(pages.length - 1, keepIndex));
  document.body.classList.toggle('reader-single', readerMode === 'single');
  document.body.classList.toggle('reader-double', readerMode === 'double');
  stream.classList.toggle('reader-single-mode', readerMode === 'single');
  stream.classList.toggle('reader-double-mode', readerMode === 'double');
  var modeScroll = document.getElementById('modeScroll');
  var modeSingle = document.getElementById('modeSingle');
  var modeDouble = document.getElementById('modeDouble');
  if (modeScroll) modeScroll.classList.toggle('active', readerMode === 'scroll');
  if (modeSingle) modeSingle.classList.toggle('active', readerMode === 'single');
  if (modeDouble) modeDouble.classList.toggle('active', readerMode === 'double');
  applySingleFit(singleFit, false);
  if (previousMode === 'double' && readerMode !== 'double') cleanupDoubleLayout();
  pages.forEach(function(page, idx) {
    page.classList.toggle('is-active', readerMode === 'single' && idx === activePageIndex);
    if (readerMode !== 'double') clearDoublePageState(page);
  });

  if (readerMode === 'single') {
    window.scrollTo(0, 0);
    ensurePageLoaded(activePageIndex);
    ensurePageLoaded(activePageIndex - 1);
    ensurePageLoaded(activePageIndex + 1);
    updateProgress(activePageIndex);
    saveCurrentProgress(activePageIndex);
    if (!options.initial) showSingleReaderTip();
  } else if (readerMode === 'double') {
    rebuildDoubleGroups(activePageIndex, { behavior: options.initial ? 'auto' : 'smooth' });
  } else {
    requestAnimationFrame(function() {
      var target = pages[activePageIndex];
      if (target) target.scrollIntoView({ behavior: options.initial ? 'auto' : 'smooth', block: 'start' });
      updateProgress(activePageIndex);
    });
  }

  if (options.persist !== false) {
    if (window.JmvPrefs) JmvPrefs.set('readerMode', readerMode);
    else try { localStorage.setItem('jmv-reader-mode', readerMode); } catch (e) {}
  }
  updateDocumentScrollProgress(false);
}

function gotoPage(idx) {
  if (idx >= pages.length) {
    if (isPagedMode() && isAutoNext && NEXT_DIR_PATH) showJumpCountdown();
    else if (isPagedMode() && window.toast) toast('已经是最后一页');
    return;
  }
  idx = Math.max(0, idx);
  var target = pages[idx];
  if (!target) return;
  activePageIndex = idx;
  if (readerMode === 'single') {
    pages.forEach(function(page, pageIdx) { page.classList.toggle('is-active', pageIdx === idx); });
    ensurePageLoaded(idx);
    ensurePageLoaded(idx - 1);
    ensurePageLoaded(idx + 1);
    target.scrollTop = 0;
    updateGridCurrentPage();
  } else if (readerMode === 'double') {
    if (!doubleGroups.length) rebuildDoubleGroups(idx);
    applyDoubleGroup(findDoubleGroupIndex(idx), idx);
    return;
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  updateProgress(idx);
  saveCurrentProgress(idx);
}

function scrollActiveSinglePage(direction) {
  if (readerMode !== 'single' || singleFit !== 'custom') return false;
  var page = pages[activePageIndex];
  if (!page || page.scrollHeight <= page.clientHeight + 4) return false;
  var maxScroll = page.scrollHeight - page.clientHeight;
  if (direction > 0 && page.scrollTop < maxScroll - 4) {
    page.scrollBy({ top: Math.max(160, page.clientHeight * .82), behavior: 'smooth' });
    return true;
  }
  if (direction < 0 && page.scrollTop > 4) {
    page.scrollBy({ top: -Math.max(160, page.clientHeight * .82), behavior: 'smooth' });
    return true;
  }
  return false;
}

function applyReadingDirection(direction, persist) {
  readingDirection = direction === 'rtl' ? 'rtl' : 'ltr';
  document.body.dataset.readingDirection = readingDirection;
  stream.dataset.readingDirection = readingDirection;
  if (readerMode === 'double') rebuildDoubleGroups(activePageIndex, { scroll: false });
  if (persist) {
    if (window.JmvPrefs) JmvPrefs.set('readingDirection', readingDirection);
    else try { localStorage.setItem('jmv-reading-direction', readingDirection); } catch (e) {}
  }
}

var readerGridOverlay = document.getElementById('readerGridOverlay');
var readerGrid = document.getElementById('readerGrid');
var readerGridClose = document.getElementById('readerGridClose');

function updateGridCurrentPage() {
  if (!readerGrid) return;
  readerGrid.querySelectorAll('[data-reader-page]').forEach(function(item) {
    var current = parseInt(item.dataset.readerPage, 10) === activePageIndex;
    item.classList.toggle('is-current', current);
    if (current) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function rebuildReaderGrid() {
  if (!readerGrid) return;
  readerGrid.textContent = '';
  pages.forEach(function(page, idx) {
    var sourceImage = page.querySelector('.page-img');
    if (!sourceImage) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'reader-grid-item';
    button.dataset.readerPage = String(idx);
    button.setAttribute('aria-label', '跳转到第 ' + (idx + 1) + ' 页');

    var thumbnail = document.createElement('img');
    thumbnail.loading = 'lazy';
    thumbnail.decoding = 'async';
    thumbnail.alt = '';
    thumbnail.src = sourceImage.getAttribute('data-src') || sourceImage.getAttribute('data-original') || sourceImage.src;
    var label = document.createElement('span');
    label.textContent = String(idx + 1);
    button.appendChild(thumbnail);
    button.appendChild(label);
    button.addEventListener('click', function() {
      gotoPage(idx);
      closeReaderGrid();
    });
    readerGrid.appendChild(button);
  });
  updateGridCurrentPage();
}

function openReaderGrid() {
  if (!readerGridOverlay || !readerGrid) return;
  rebuildReaderGrid();
  readerGridOverlay.classList.add('show');
  readerGridOverlay.setAttribute('aria-hidden', 'false');
  if (tGridButton) tGridButton.classList.add('active');
  var current = readerGrid.querySelector('.is-current');
  if (current) requestAnimationFrame(function() { current.scrollIntoView({ block: 'center' }); });
}

function closeReaderGrid() {
  if (!readerGridOverlay) return;
  readerGridOverlay.classList.remove('show');
  readerGridOverlay.setAttribute('aria-hidden', 'true');
  if (tGridButton) tGridButton.classList.remove('active');
}

if (tGridButton) tGridButton.addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  if (readerGridOverlay && readerGridOverlay.classList.contains('show')) closeReaderGrid();
  else openReaderGrid();
});
if (readerGridClose) readerGridClose.addEventListener('click', closeReaderGrid);
if (readerGridOverlay) readerGridOverlay.addEventListener('click', function(e) {
  if (e.target === readerGridOverlay) closeReaderGrid();
});
window.addEventListener('jmv:preference-change', function(e) {
  if (!e.detail) return;
  if (e.detail.name === 'readingDirection') applyReadingDirection(e.detail.value, false);
  if (e.detail.name === 'doubleWidthScale') applyDoubleWidthScale(e.detail.value, false);
  if (e.detail.name === 'readerMode' && e.detail.value !== readerMode) setReaderMode(e.detail.value, { persist: false });
});
applyReadingDirection(readingDirection, false);

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
      e.preventDefault();
      if (readerGridOverlay && readerGridOverlay.classList.contains('show')) closeReaderGrid();
      else openReaderGrid();
      break;
    case 'm': case 'M':
      e.preventDefault();
      setReaderMode(readerMode === 'scroll' ? 'single' : (readerMode === 'single' ? 'double' : 'scroll'));
      break;
    case 'h': case 'H':
      e.preventDefault();
      if (desktopToolbarQuery.matches) setToolbarPinned(!toolbarPinned, true);
      else if (rTools.classList.contains('is-open')) closeToolbar(true);
      else openToolbar();
      break;
    case '?':
      e.preventDefault(); openReaderHelp(); break;
    case 'Escape':
    case 'Esc':
      closeRotateRadial();
      closeReaderGrid();
      closeReaderHelp(); closeJump(); closeSize(); closeMore();
      if (!desktopToolbarQuery.matches) closeToolbar(true);
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
