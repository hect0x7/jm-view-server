renderShell('files');
document.querySelectorAll('[data-favorite-time]').forEach(function(element) {
  var date = new Date(Number(element.dataset.favoriteTime) * 1000);
  if (isNaN(date.getTime())) { element.textContent = '未知'; return; }
  element.dateTime = date.toISOString();
  element.textContent = date.toLocaleString();
});

function updateFavoriteCounts() {
  document.getElementById('favoriteTotalCount').textContent = document.querySelectorAll('.favorite-card').length;
  document.getElementById('favoriteAvailableCount').textContent = document.querySelectorAll('.favorite-card[data-available="1"]').length;
  if (!document.querySelector('.favorite-card')) {
    document.getElementById('favoritesEmpty').hidden = false;
    var readerLink = document.getElementById('readFavorites');
    if (readerLink) readerLink.remove();
  }
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
  if (button.dataset.favoriteAction === 'copy-path') {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(card.dataset.path);
      else {
        var field = document.createElement('textarea');
        field.value = card.dataset.path;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        try { field.select(); if (!document.execCommand('copy')) throw new Error(); }
        finally { field.remove(); button.focus({preventScroll:true}); }
      }
      toast('原图路径已复制');
    } catch (error) { toast('无法复制，请从卡片中选择路径复制'); }
    return;
  }
  button.disabled = true;
  try {
    var response = await fetch('/api/favorites', {
      method: 'DELETE', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path: card.dataset.path})
    });
    if (!response.ok) throw new Error();
    card.remove();
    updateFavoriteCounts();
    toast('已取消收藏');
  } catch (error) {
    toast('取消收藏失败，请重试');
    button.disabled = false;
  }
});
