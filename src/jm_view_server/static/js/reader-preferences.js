/* ============================================================
   新增阅读增强功能（纯前端，均记 localStorage，key 前缀 jmv-）
   ============================================================ */

// 相册标识：优先用标题，作为 localStorage key 的一部分
var ALBUM_ID = readerConfig.albumId;
var PROGRESS_KEY = 'jmv-progress:' + ALBUM_ID;
var CUSTOM_SEQUENCE_KEY = 'jmv-custom-seq:' + ALBUM_ID;
var PERSIST_SEQUENCE_KEY = 'jmv-persist-seq:' + ALBUM_ID;

// 原始页面元素引用与索引
var rawPages = Array.from(pages);
var originalSequence = rawPages.map(function(p, i) {
  return { type: 'page', pageIndex: i };
});

function cloneSequence(seq) {
  return seq.map(function(item) {
    return { type: item.type, pageIndex: item.pageIndex, id: item.id };
  });
}

// 记忆开关状态：默认关闭 (false)，刷新重置
var isSequencePersisted = (function() {
  try {
    return localStorage.getItem(PERSIST_SEQUENCE_KEY) === '1';
  } catch (e) {
    return false;
  }
})();

// 当前画板序列：包含常规图片项与虚拟空白项
var pageSequence = cloneSequence(originalSequence);

// 若开启了记忆，则尝试恢复保存的序列
if (isSequencePersisted) {
  try {
    var savedSeqRaw = localStorage.getItem(CUSTOM_SEQUENCE_KEY);
    if (savedSeqRaw) {
      var parsedSeq = JSON.parse(savedSeqRaw);
      if (Array.isArray(parsedSeq) && parsedSeq.length) {
        var validSeq = parsedSeq.filter(function(item) {
          if (!item) return false;
          if (item.type === 'blank') return true;
          if (item.type === 'page' && typeof item.pageIndex === 'number' && item.pageIndex >= 0 && item.pageIndex < rawPages.length) return true;
          return false;
        });
        if (validSeq.length) pageSequence = validSeq;
      }
    }
  } catch (e) {}
}

function saveSequenceState() {
  if (isSequencePersisted) {
    try {
      localStorage.setItem(PERSIST_SEQUENCE_KEY, '1');
      localStorage.setItem(CUSTOM_SEQUENCE_KEY, JSON.stringify(pageSequence));
    } catch (e) {}
  } else {
    try {
      localStorage.removeItem(PERSIST_SEQUENCE_KEY);
      localStorage.removeItem(CUSTOM_SEQUENCE_KEY);
    } catch (e) {}
  }
}

// 同步主阅读流 DOM 顺序与双页重排
function applySequenceToDOM(options) {
  options = options || {};

  // 1. 同步 stream 中的 DOM 节点挂载顺序
  var pageItems = pageSequence.filter(function(item) { return item.type === 'page'; });
  pageItems.forEach(function(item) {
    var el = rawPages[item.pageIndex];
    if (el && el.parentNode === stream) {
      stream.appendChild(el);
    }
  });

  // 2. 双页模式下重新构建双页组
  if (readerMode === 'double') {
    rebuildDoubleGroups(activePageIndex, { scroll: false });
  }

  // 3. 更新统计状态与控件
  updateGridStats();
}

function updateInsertPageButtonState() {
  // 旧按钮已移除，保留空函数避免外部生命周期调用报错
}

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
  var automatic = readerMode === 'scroll' ? (window.JmvPrefs && JmvPrefs.get('scrollFit') === 'window') : singleFit === 'contain';
  sizeVal.textContent = automatic ? '适应' : (sizeRange ? sizeRange.value + 'px' : '800px');
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

  var isScroll = readerMode === 'scroll';
  var widthPreference = isScroll ? 'scrollImageSize' : 'imageSize';
  if (!isInit && isScroll && window.JmvPrefs) JmvPrefs.set('scrollFit', 'custom');
  var fitWindow = isScroll && window.JmvPrefs && JmvPrefs.get('scrollFit') === 'window';
  // 模式分别读取宽度；下拉适应窗口时不限制最大宽度。
  stream.style.maxWidth = fitWindow ? 'none' : v + 'px';
  stream.style.setProperty('--reader-custom-width', v + 'px');

  // 同步滑块及文字显示
  if (sizeRange) sizeRange.value = String(v);
  if (sizeVal && readerMode !== 'double') sizeVal.textContent = (fitWindow || (!isScroll && singleFit === 'contain' && isInit)) ? '适应' : v + 'px';

  if (readerMode !== 'double') {
    if (window.JmvPrefs) JmvPrefs.set(widthPreference, v);
    else try { localStorage.setItem(isScroll ? 'jmv-scroll-image-size' : 'jmv-img-custom-size', String(v)); } catch (e) {}
  }
  if (!isInit && !isScroll) applySingleFit('custom', true);
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
    if (readerMode === 'scroll' && window.JmvPrefs) JmvPrefs.set('scrollFit', 'window');
    applyImageSize(800, true);
    if (readerMode === 'single') applySingleFit('contain', true);
    if (window.toast) {
      toast('已恢复适应屏幕', 'success');
    }
  });
}

// 恢复状态
(function initCustomImageSize() {
  var saved = window.JmvPrefs ? JmvPrefs.get(readerMode === 'scroll' ? 'scrollImageSize' : 'imageSize') : 800;
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
