/* ============================================================
   新增阅读增强功能（纯前端，均记 localStorage，key 前缀 jmv-）
   ============================================================ */

// Use folder identity to keep equally named albums separate.
var ALBUM_ID = readerConfig.favorites ? 'favorites' : readerConfig.albumPath;
var PROGRESS_KEY = 'jmv-progress:' + ALBUM_ID;
var CUSTOM_SEQUENCE_KEY = 'jmv-custom-seq:' + ALBUM_ID;
var PERSIST_SEQUENCE_KEY = 'jmv-persist-seq:' + ALBUM_ID;
try {
  ['jmv-progress:', 'jmv-custom-seq:', 'jmv-persist-seq:'].forEach(function(prefix) {
    if (localStorage.getItem(prefix + ALBUM_ID) === null) {
      var old = localStorage.getItem(prefix + readerConfig.albumId);
      if (old !== null) localStorage.setItem(prefix + ALBUM_ID, old);
    }
  });
} catch (error) {}

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
  var ranges = typeof ALBUM_RANGES === 'undefined' ? [{start: 0, end: rawPages.length - 1, path: readerConfig.albumPath}] : ALBUM_RANGES;
  ranges.forEach(function(range) {
    var sequence = pageSequence.filter(function(item, index) {
      var pageIndex = item.pageIndex;
      if (item.type === 'blank') {
        var next = pageSequence.slice(index + 1).find(function(other) { return other.type === 'page'; });
        var previous = pageSequence.slice(0, index).reverse().find(function(other) { return other.type === 'page'; });
        pageIndex = next ? next.pageIndex : previous ? previous.pageIndex : range.start;
      }
      return pageIndex >= range.start && pageIndex <= range.end;
    });
    var album = readerConfig.favorites ? 'favorites' : range.path;
    var localSequence = sequence.map(function(item) { return item.type === 'blank' ? {type: 'blank', id: item.id} : {type: 'page', pageIndex: item.pageIndex - range.start}; });
    try {
      if (isSequencePersisted) {
        localStorage.setItem('jmv-persist-seq:' + album, '1');
        localStorage.setItem('jmv-custom-seq:' + album, JSON.stringify(localSequence));
      } else {
        localStorage.removeItem('jmv-persist-seq:' + album);
        localStorage.removeItem('jmv-custom-seq:' + album);
      }
    } catch (error) {}
    if (window.JmvReaderMemory && !readerConfig.favorites) JmvReaderMemory.sequence(album, isSequencePersisted ? sequence.map(function(item) {
      return item.type === 'blank' ? {type: 'blank', id: item.id} : {type: 'page', path: JmvReaderMemory.imagePath(rawPages[item.pageIndex].querySelector('.page-img'))};
    }) : null);
  });
}

// 同步主阅读流 DOM 顺序与双页重排
function applySequenceToDOM(options) {
  options = options || {};

  // 空白页的变更只需重新编组，保留已挂载的原图节点。
  if (!options.blanksOnly) {
    var pageItems = pageSequence.filter(function(item) { return item.type === 'page'; });
    pageItems.forEach(function(item) {
      var el = rawPages[item.pageIndex];
      if (el && el.parentNode === stream) {
        stream.appendChild(el);
      }
    });
  }

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
function applyEye(on, persist) {
  stream.classList.toggle('eye-care', !!on);
  document.body.classList.toggle('reader-eye-care', !!on);
  document.getElementById('tEye').classList.toggle('active', !!on);
  if (persist === false) return;
  if (window.JmvPrefs) JmvPrefs.set('eyeCare', !!on);
  else try { localStorage.setItem('jmv-eyecare', on ? '1' : '0'); } catch (e) {}
}
applyEye(window.JmvPrefs ? JmvPrefs.get('eyeCare') : (function(){ try { return localStorage.getItem('jmv-eyecare') === '1'; } catch(e){ return false; } })(), false);
document.getElementById('tEye').addEventListener('click', function() {
  this.blur();
  applyEye(!stream.classList.contains('eye-care'));
});

// ---------- 阅读方式中的画面大小 ----------
var sizeRange = document.getElementById('tSizeRange');
var sizeVal = document.getElementById('tSizeVal');
var sizeReset = document.getElementById('tSizeReset');
var sizeRangeControl = document.getElementById('sizeRangeControl');
var doubleWidthScaleControl = document.getElementById('doubleWidthScaleControl');
var doubleWidthScaleRange = document.getElementById('doubleWidthScaleRange');
var doubleWidthScaleValue = document.getElementById('doubleWidthScaleValue');

function syncSizeControls() {
  var isDouble = readerMode === 'double';
  if (sizeRangeControl) sizeRangeControl.hidden = isDouble;
  if (doubleWidthScaleControl) doubleWidthScaleControl.hidden = !isDouble;
  if (doubleWidthScaleRange) doubleWidthScaleRange.value = String(doubleWidthScale);
  if (doubleWidthScaleValue) {
    doubleWidthScaleValue.textContent = formatDoubleWidthScale(doubleWidthScale);
    doubleWidthScaleValue.hidden = !isDouble;
  }
  if (doubleWidthScaleRange && doubleWidthScaleValue) {
    doubleWidthScaleRange.setAttribute('aria-valuetext', doubleWidthScaleValue.textContent);
  }
  if (sizeVal) sizeVal.hidden = isDouble;
  if (!sizeVal || isDouble) return;
  var automatic = readerMode === 'scroll' ? (window.JmvPrefs && JmvPrefs.get('scrollFit') === 'window') : singleFit === 'contain';
  sizeVal.textContent = automatic ? '自动适配' : (sizeRange ? sizeRange.value + ' px' : '800 px');
  if (sizeRange) sizeRange.setAttribute('aria-valuetext', sizeVal.textContent);
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
  var automaticScrollWidth = isScroll && window.JmvPrefs && JmvPrefs.get('scrollFit') === 'window';
  stream.style.maxWidth = (automaticScrollWidth ? 800 : v) + 'px';
  stream.style.setProperty('--reader-custom-width', v + 'px');

  // 同步滑块及文字显示
  if (sizeRange) sizeRange.value = String(v);

  if (readerMode !== 'double') {
    if (window.JmvPrefs) JmvPrefs.set(widthPreference, v);
    else try { localStorage.setItem(isScroll ? 'jmv-scroll-image-size' : 'jmv-img-custom-size', String(v)); } catch (e) {}
  }
  if (!isInit && !isScroll) applySingleFit('custom', true);
  else syncSizeControls();
  restoreReaderViewport(viewportSnapshot);
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
    preserveReaderViewport(function() {
      if (readerMode === 'scroll' && window.JmvPrefs) JmvPrefs.set('scrollFit', 'window');
      applyImageSize(800, true);
      if (readerMode === 'single') applySingleFit('contain', true);
    });
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

function setAutoNext(on, persist) {
  isAutoNext = !!on;
  if (tAutoNext) tAutoNext.classList.toggle('active', isAutoNext);
  if (persist !== false && window.JmvPrefs) JmvPrefs.set('autoNext', isAutoNext);
}

setAutoNext(isAutoNext, false);

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
var AUTO_NEXT_COUNTDOWN_SECONDS = 5;
var countdownSec = AUTO_NEXT_COUNTDOWN_SECONDS;
var jumpBar = null;
var isCancelledThisTime = false;
var isLoadingNextAlbum = false;

function checkTouchBottom() {
  if (!readerInitialized) return;
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
  countdownSec = AUTO_NEXT_COUNTDOWN_SECONDS;
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
  if (!readerInitialized) return;
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

  // Page identities must follow the original array, never the reordered DOM.
  var startIdx = rawPages.length;
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
    rawPages.push(container);
    originalSequence.push({ type: 'page', pageIndex: globalIdx });
    pageSequence.push({ type: 'page', pageIndex: globalIdx });
  });

  TOTAL = rawPages.length;
  pages = rawPages;
  NEXT_DIR_PATH = res.next_dir_path;

  ALBUM_RANGES.push({
    start: startIdx,
    end: startIdx + newImagesCount - 1,
    key: 'jmv-progress:' + res.full_path,
    path: res.full_path,
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
  // Register new images only after all indices and album ranges are available.
  if (window.JmvImageLoader) JmvImageLoader.scan(streamEl);
  if (wasAtPagedEnd) gotoPage(startIdx);
}

// ---------- 图片临时旋转：由图片操作面板选择方向 ----------
function updateImageRotationFit(img) {
  var width = img.naturalWidth > 1 ? img.naturalWidth : img.clientWidth;
  var height = img.naturalHeight > 1 ? img.naturalHeight : img.clientHeight;
  var ratio = width > 0 && height > 0 ? width / height : 2 / 3;
  img.style.setProperty('--reader-quarter-turn-fit', String(Math.min(1, ratio, 1 / ratio)));
}
function setImageRotation(img, deg) {
  deg = parseInt(deg, 10) || 0;
  img.dataset.rotate = String(deg);
  updateImageRotationFit(img);
  img.style.transform = 'rotate(' + deg + 'deg)' + (deg % 180 ? ' scale(var(--reader-rotation-fit, 1))' : '');
}
