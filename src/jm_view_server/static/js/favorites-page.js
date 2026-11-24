renderShell('files');
document.querySelectorAll('[data-favorite-time]').forEach(function(element) {
  var date = new Date(Number(element.dataset.favoriteTime) * 1000);
  if (isNaN(date.getTime())) { element.textContent = '未知'; return; }
  element.dateTime = date.toISOString();
  element.textContent = date.toLocaleString();
});

function bumpCounter(el, nextValue) {
  if (!el) return;
  var prev = el.textContent;
  el.textContent = String(nextValue);
  if (prev !== String(nextValue)) {
    el.classList.remove('is-bumped');
    void el.offsetWidth;
    el.classList.add('is-bumped');
    setTimeout(function() { el.classList.remove('is-bumped'); }, 240);
  }
}

function updateFavoriteCounts() {
  var total = document.querySelectorAll('.favorite-card:not(.is-removing)').length;
  var available = document.querySelectorAll('.favorite-card:not(.is-removing)[data-available="1"]').length;
  bumpCounter(document.getElementById('favoriteTotalCount'), total);
  bumpCounter(document.getElementById('favoriteAvailableCount'), available);
  var empty = document.getElementById('favoritesEmpty');
  if (empty) empty.hidden = total > 0;
  var readerLink = document.getElementById('readFavorites');
  if (readerLink) readerLink.hidden = total === 0;
}

document.addEventListener('jmv:favorites-cleared', function(event) {
  var paths = new Set(event.detail.paths);
  document.querySelectorAll('.favorite-card').forEach(function(card) {
    if (paths.has(card.dataset.path)) card.remove();
  });
  updateFavoriteCounts();
});

document.querySelector('.favorites-grid').addEventListener('click', async function(event) {
  var button = event.target.closest('button');
  if (!button || button.disabled) return;
  var card = button.closest('.favorite-card');
  if (!card) return;

  if (button.dataset.favoriteAction === 'copy-path') {
    var copied = false;
    if (typeof window.jmvCopyText === 'function') {
      copied = await window.jmvCopyText(card.dataset.path);
    } else {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(card.dataset.path);
          copied = true;
        }
      } catch (e) { copied = false; }
    }
    if (copied) {
      toast('原图路径已复制', 'success');
      var iconWrap = button.querySelector('[data-favorite-icon]');
      if (iconWrap) {
        iconWrap.innerHTML = icon('check');
        button.classList.add('is-copied');
        clearTimeout(button._copyTimer);
        button._copyTimer = setTimeout(function() {
          iconWrap.innerHTML = icon('copy');
          button.classList.remove('is-copied');
        }, 1400);
      }
    } else {
      toast('无法复制，请从卡片中选择路径复制', 'error');
    }
    return;
  }

  var grid = card.parentElement;
  var nextSibling = card.nextElementSibling;
  var imagePath = card.dataset.path;
  var isAvailable = card.dataset.available === '1';
  button.disabled = true;
  card.classList.add('is-pending');
  try {
    var response = await fetch('/api/favorites', {
      method: 'DELETE', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path: imagePath})
    });
    if (!response.ok) throw new Error();
    card.classList.remove('is-pending');
    card.classList.add('is-removing');
    updateFavoriteCounts();
    var delay = (window.jmvPrefersReducedMotion && window.jmvPrefersReducedMotion()) ? 0 : 200;
    clearTimeout(card._removeTimer);
    card._removeTimer = setTimeout(function() {
      card._removeTimer = null;
      if (card.classList.contains('is-removing')) {
        card.remove();
        updateFavoriteCounts();
      }
    }, delay);
    if (!isAvailable) {
      toast('已移除失效收藏记录', 'default');
      return;
    }
    toast('已取消收藏', 'default', {
      actionLabel: '撤销',
      onAction: async function() {
        try {
          var restoreResp = await fetch('/api/favorites', {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: imagePath})
          });
          if (!restoreResp.ok) throw new Error();
          var restoredData = await restoreResp.json().catch(function() { return {}; });
          clearTimeout(card._removeTimer);
          card._removeTimer = null;
          card.classList.remove('is-removing', 'is-pending');
          card.classList.add('is-restored');
          button.disabled = false;
          var createdTimeEl = card.querySelector('.favorite-metadata time[data-favorite-time]');
          var ts = restoredData && restoredData.record && restoredData.record.created_at;
          if (createdTimeEl && ts) {
            var d = new Date(Number(ts) * 1000);
            if (!isNaN(d.getTime())) {
              createdTimeEl.dataset.favoriteTime = String(ts);
              createdTimeEl.dateTime = d.toISOString();
              createdTimeEl.textContent = d.toLocaleString();
            }
          }
          if (grid) {
            if (ts && grid.firstElementChild && grid.firstElementChild !== card) {
              grid.insertBefore(card, grid.firstElementChild);
            } else if (!card.isConnected) {
              if (nextSibling && nextSibling.parentElement === grid) grid.insertBefore(card, nextSibling);
              else grid.appendChild(card);
            }
          }
          updateFavoriteCounts();
          toast('已恢复收藏', 'success');
        } catch (err) {
          toast('恢复收藏失败，原图可能已不存在', 'error');
        }
      }
    });
  } catch (error) {
    card.classList.remove('is-pending');
    toast('取消收藏失败，请重试', 'error');
    button.disabled = false;
  }
});
