var imageActions = document.getElementById('imageActions');
var imageActionClose = document.getElementById('imageActionClose');
var imageActionInsert = document.getElementById('imageActionInsert');
var imageActionTarget = null;
var imageActionVersion = 0;
var imageHoldTimer = null;
var imageHoldStart = null;
var suppressPageClickUntil = 0;
var imageActionPreviousFocus = null;

function cancelImageHold() {
  clearTimeout(imageHoldTimer);
  imageHoldTimer = null;
  imageHoldStart = null;
}

function closeImageActions() {
  if (!imageActions || !imageActions.classList.contains('show')) return;
  cancelImageHold();
  imageActionVersion++;
  imageActions.classList.remove('show');
  imageActions.setAttribute('aria-hidden', 'true');
  imageActions.setAttribute('inert', '');
  imageActionTarget = null;
  suppressPageClickUntil = Date.now() + 350;
  if (imageActionPreviousFocus && imageActionPreviousFocus.isConnected) imageActionPreviousFocus.focus({preventScroll: true});
}

function imageActionPageIndex(image) {
  return Number(image.closest('.scramble-page').dataset.page);
}

function syncImageActionInsert() {
  if (readerMode !== 'double' && document.activeElement === imageActionInsert) {
    imageActionClose.focus({preventScroll: true});
  }
  imageActionInsert.hidden = readerMode !== 'double';
}

async function openImageActions(image) {
  if (!imageActions || !image) return;
  if (window.JmvImageLoader) image = JmvImageLoader.currentImage(image);
  var version = ++imageActionVersion;
  imageActionTarget = image;
  if (!imageActions.classList.contains('show')) imageActionPreviousFocus = document.activeElement;
  suppressPageClickUntil = Date.now() + 700;
  document.getElementById('imageActionPreview').src = image.getAttribute('data-original') || image.getAttribute('data-src') || image.src;
  var index = imageActionPageIndex(image);
  document.getElementById('imageActionTitle').textContent = '第 ' + (index + 1) + ' 页 · 图片操作';
  syncImageActionInsert();
  var favoriteButton = document.getElementById('imageActionFavorite');
  var status = document.getElementById('imageActionStatus');
  favoriteButton.disabled = true;
  favoriteButton.textContent = '正在读取收藏状态…';
  favoriteButton.dataset.favorite = '';
  status.textContent = '';
  var current = String(parseInt(image.dataset.rotate || '0', 10) % 360);
  imageActions.querySelectorAll('[data-rotate]').forEach(function(button) {
    button.setAttribute('aria-pressed', button.dataset.rotate === current ? 'true' : 'false');
  });
  imageActions.removeAttribute('inert');
  imageActions.classList.add('show');
  imageActions.setAttribute('aria-hidden', 'false');
  imageActionClose.focus({preventScroll: true});
  try {
    var state = await JmvFavorites.read(image);
    if (version !== imageActionVersion) return;
    favoriteButton.dataset.favorite = state.favorite ? '1' : '0';
    favoriteButton.textContent = state.favorite ? '♥ 取消收藏' : '♡ 收藏图片';
    favoriteButton.disabled = false;
  } catch (error) {
    if (version !== imageActionVersion) return;
    status.textContent = error.message;
    favoriteButton.textContent = '重试读取收藏状态';
    favoriteButton.disabled = false;
  }
}

stream.addEventListener('pointerdown', function(event) {
  if (!event.isPrimary) { cancelImageHold(); return; }
  var image = event.target.closest ? event.target.closest('.page-img') : null;
  if (!image || (event.pointerType === 'mouse' && event.button !== 0)) return;
  cancelImageHold();
  imageHoldStart = {x: event.clientX, y: event.clientY, pointerId: event.pointerId};
  imageHoldTimer = setTimeout(function() {
    clearTimeout(pageClickTimer);
    openImageActions(image);
    imageHoldTimer = null;
  }, event.pointerType === 'mouse' ? 520 : 650);
});
window.addEventListener('pointermove', function(event) {
  if (imageHoldStart && event.pointerId === imageHoldStart.pointerId && Math.hypot(event.clientX - imageHoldStart.x, event.clientY - imageHoldStart.y) > 10) cancelImageHold();
}, true);
function endImageHold(event) { if (imageHoldStart && event.pointerId === imageHoldStart.pointerId) cancelImageHold(); }
window.addEventListener('pointerup', endImageHold, true);
window.addEventListener('pointercancel', endImageHold, true);
window.addEventListener('blur', cancelImageHold);
window.addEventListener('scroll', cancelImageHold, {passive: true});
window.addEventListener('jmv:reader-image-replaced', function(event) {
  cancelImageHold();
  if (imageActionTarget === event.detail.previous) imageActionTarget = event.detail.image;
});
stream.addEventListener('contextmenu', function(event) { if (event.target.closest && event.target.closest('.page-img')) event.preventDefault(); });
stream.addEventListener('dragstart', function(event) { if (event.target.closest && event.target.closest('.page-img')) event.preventDefault(); });

imageActionClose.addEventListener('click', closeImageActions);
imageActionInsert.addEventListener('click', function() {
  if (readerMode !== 'double' || !imageActionTarget) return;
  if (insertBlankBeforePage(imageActionPageIndex(imageActionTarget))) closeImageActions();
});
imageActions.addEventListener('click', function(event) { if (event.target === imageActions) closeImageActions(); });
imageActions.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeImageActions(); }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].indexOf(event.key) !== -1) {
    event.preventDefault();
  }
  if (event.key !== 'Tab') return;
  var buttons = Array.from(imageActions.querySelectorAll('button:not([disabled]):not([hidden])'));
  var first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
imageActions.querySelectorAll('[data-rotate]').forEach(function(button) {
  button.addEventListener('click', function() {
    if (imageActionTarget) setImageRotation(imageActionTarget, button.dataset.rotate);
    closeImageActions();
  });
});
document.getElementById('imageActionFavorite').addEventListener('click', async function() {
  var image = imageActionTarget;
  var version = imageActionVersion;
  if (!image || this.disabled) return;
  if (this.dataset.favorite === '') { openImageActions(image); return; }
  var wanted = this.dataset.favorite !== '1';
  this.disabled = true;
  document.getElementById('imageActionStatus').textContent = '正在保存…';
  try {
    var favorite = await JmvFavorites.set(image, wanted);
    if (version !== imageActionVersion) return;
    this.dataset.favorite = favorite ? '1' : '0';
    this.textContent = favorite ? '♥ 取消收藏' : '♡ 收藏图片';
    document.getElementById('imageActionStatus').textContent = favorite ? '图片已收藏' : '已取消收藏';
  } catch (error) {
    if (version === imageActionVersion) document.getElementById('imageActionStatus').textContent = error.message;
  } finally { if (version === imageActionVersion) this.disabled = false; }
});
