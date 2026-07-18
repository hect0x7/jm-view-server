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
var activePageIndex = 0;

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
  if (readerMode === 'single') return;
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  rBottom.classList.toggle('hidden', willHide);
  tProg.classList.toggle('active', !willHide);
  try { localStorage.setItem('jmv-prog-hidden', willHide ? '1' : '0'); } catch (e) {}
});

// 项2：工具栏“跳转页码”——贴附工具栏的原地浮窗（非全屏 modal，参考旧版直白交互）。
// 页码用下拉选择（同底部进度条 pageselect），选中即跳页并收起浮窗；点外部/Esc 收起。
var tJump = document.getElementById('tJump');
var jumpPop = document.getElementById('jumpPop');
var jumpSelect = document.getElementById('jumpSelect'); // <select>，value 为 0-based 页索引

function currentPageIdx() {
  if (readerMode === 'single') return activePageIndex;
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
    if (readerMode === 'single') gotoPage(parseInt(ps.value, 10));
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
  toolbarPinned = !!pinned;
  rTools.classList.toggle('is-pinned', toolbarPinned);
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
  toolbarPinned = false;
  rTools.classList.remove('is-pinned');
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
  readerTop.classList.toggle('hidden', willHide);
  tHead.classList.toggle('active', !willHide);
  try { localStorage.setItem('jmv-head-hidden', willHide ? '1' : '0'); } catch (e) {}
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

function applySingleFit(mode, persist) {
  singleFit = mode === 'custom' ? 'custom' : 'contain';
  stream.classList.toggle('reader-single-custom', singleFit === 'custom');
  if (sizeVal && singleFit === 'contain') sizeVal.textContent = '适应';
  if (persist) {
    if (window.JmvPrefs) JmvPrefs.set('singleFit', singleFit);
    else try { localStorage.setItem('jmv-single-fit', singleFit); } catch (e) {}
  }
}

function applyImageSize(val, isInit) {
  var v = Math.max(300, Math.min(1600, parseInt(val, 10) || 800));
  
  // 动态调节图片容器最大宽度
  stream.style.maxWidth = v + 'px';
  stream.style.setProperty('--reader-custom-width', v + 'px');
  
  // 同步滑块及文字显示
  if (sizeRange) sizeRange.value = String(v);
  if (sizeVal) sizeVal.textContent = singleFit === 'contain' && isInit ? '适应' : v + 'px';
  
  if (window.JmvPrefs) JmvPrefs.set('imageSize', v);
  else try { localStorage.setItem('jmv-img-custom-size', String(v)); } catch (e) {}
  if (!isInit) applySingleFit('custom', true);
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

if (sizeReset) {
  sizeReset.addEventListener('click', function(e) {
    e.stopPropagation();
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
  if (readerMode === 'single' && activePageIndex === startIdx - 1) gotoPage(startIdx);
}

// ---------- 项11：图片临时旋转（右键/长按图片，0/90/180/270 循环，不记忆） ----------
// 用 dataset 记每张图当前角度；
function rotateImage(img) {
  var deg = (parseInt(img.dataset.rotate || '0', 10) + 90) % 360;
  img.dataset.rotate = String(deg);
  img.style.transform = 'rotate(' + deg + 'deg)';
}

stream.addEventListener('contextmenu', function(e) {
  var img = e.target.closest ? e.target.closest('.page-img') : null;
  if (!img) return;
  e.preventDefault();
  e.stopPropagation();
  if (img.dataset.longpressed) {
    delete img.dataset.longpressed;
    return;
  }
  rotateImage(img);
});

var touchTimer;
stream.addEventListener('touchstart', function(e) {
  var img = e.target.closest ? e.target.closest('.page-img') : null;
  if (!img || e.touches.length > 1) return;
  touchTimer = setTimeout(function() {
    img.dataset.longpressed = '1';
    rotateImage(img);
    if (navigator.vibrate) navigator.vibrate(50);
  }, 600);
}, {passive: true});
stream.addEventListener('touchmove', function() { clearTimeout(touchTimer); }, {passive: true});
stream.addEventListener('touchend', function() { clearTimeout(touchTimer); });
stream.addEventListener('touchcancel', function() { clearTimeout(touchTimer); });

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
  var nextMode = mode === 'single' ? 'single' : 'scroll';
  var keepIndex = currentPageIdx();
  readerMode = nextMode;
  activePageIndex = Math.max(0, Math.min(pages.length - 1, keepIndex));
  document.body.classList.toggle('reader-single', readerMode === 'single');
  stream.classList.toggle('reader-single-mode', readerMode === 'single');
  document.getElementById('modeScroll').classList.toggle('active', readerMode === 'scroll');
  document.getElementById('modeSingle').classList.toggle('active', readerMode === 'single');
  applySingleFit(singleFit, false);
  pages.forEach(function(page, idx) { page.classList.toggle('is-active', readerMode === 'single' && idx === activePageIndex); });

  if (readerMode === 'single') {
    window.scrollTo(0, 0);
    ensurePageLoaded(activePageIndex);
    ensurePageLoaded(activePageIndex - 1);
    ensurePageLoaded(activePageIndex + 1);
    updateProgress(activePageIndex);
    saveCurrentProgress(activePageIndex);
    if (!options.initial) showSingleReaderTip();
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
}

function gotoPage(idx) {
  if (idx >= pages.length) {
    if (readerMode === 'single' && isAutoNext && NEXT_DIR_PATH) showJumpCountdown();
    else if (readerMode === 'single' && window.toast) toast('已经是最后一页');
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

var pageClickTimer = null;
stream.addEventListener('click', function(e) {
  if (readerMode !== 'single') return;
  var img = e.target.closest ? e.target.closest('.page-img') : null;
  var page = e.target.closest ? e.target.closest('.scramble-page') : null;
  if (!page || !page.classList.contains('is-active') || e.detail > 1) return;
  if (img && img.dataset.longpressed) { delete img.dataset.longpressed; return; }
  clearTimeout(pageClickTimer);
  pageClickTimer = setTimeout(function() {
    var rect = page.getBoundingClientRect();
    gotoPage(activePageIndex + (e.clientX < rect.left + rect.width / 2 ? -1 : 1));
  }, 220);
});
stream.addEventListener('dblclick', function(e) {
  var img = e.target.closest ? e.target.closest('.page-img') : null;
  clearTimeout(pageClickTimer);
  if (!img) return;
  e.preventDefault();
  e.stopPropagation();
  rotateImage(img);
});

document.addEventListener('keydown', function(e) {
  if (inEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  var cur = currentPageIdx();
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault(); gotoPage(cur - 1); break;
    case 'ArrowRight':
      e.preventDefault(); gotoPage(cur + 1); break;
    case 'PageUp':
      e.preventDefault(); if (!scrollActiveSinglePage(-1)) gotoPage(cur - 1); break;
    case 'PageDown':
    case ' ':
      e.preventDefault(); if (!scrollActiveSinglePage(1)) gotoPage(cur + 1); break;
    case 'Home':
      e.preventDefault(); gotoPage(0); break;
    case 'End':
      e.preventDefault(); gotoPage(pages.length - 1); break;
    case 'f': case 'F':
      e.preventDefault(); document.getElementById('tFull').click(); break;
    case 'g': case 'G':
      e.preventDefault(); openJump(); break;
    case 'm': case 'M':
      e.preventDefault(); setReaderMode(readerMode === 'single' ? 'scroll' : 'single'); break;
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
window.addEventListener('scroll', function() {
  if (readerMode === 'single') return;
  if (saveTimer) return;
  saveTimer = setTimeout(function() {
    saveTimer = null;
    saveCurrentProgress(currentPageIdx());
  }, 300);
}, { passive: true });

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
  function dismiss() { bar.classList.remove('show'); setTimeout(function() { bar.remove(); }, 200); }
  bar.querySelector('.resume-go').addEventListener('click', function() {
    gotoPage(saved);
    dismiss();
  });
  bar.querySelector('.resume-close').addEventListener('click', dismiss);
})();
setReaderMode(readerMode, { persist: false, initial: true });
