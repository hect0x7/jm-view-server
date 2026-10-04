(function() {
  if (readerConfig.favorites) {
    document.getElementById('tOpenFolder').style.display = 'none';
    document.getElementById('tAutoNext').style.display = 'none';
  }
  document.querySelectorAll('#stream .page-img').forEach(function(image) {
    image.title = '双击收藏图片';
  });
  var pendingPaths = new Set();

  async function favoriteImage(image) {
    if (!image) return;
    var source = image.getAttribute('data-original') || image.getAttribute('data-src');
    if (!source) return;
    var path = new URL(source, location.origin).searchParams.get('path');
    if (!path || pendingPaths.has(path)) return;
    pendingPaths.add(path);
    try {
      var response = await fetch('/api/favorites', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path: path})
      });
      if (!response.ok) throw new Error();
      toast('图片已收藏');
    } catch (error) { toast('收藏失败，请刷新后重试'); }
    finally { pendingPaths.delete(path); }
  }
  stream.addEventListener('dblclick', function(event) {
    var image = event.target.closest('.page-img');
    if (!image || Date.now() < suppressPageClickUntil) return;
    event.preventDefault();
    clearTimeout(pageClickTimer);
    favoriteImage(image);
  });
  // Touch double taps do not consistently produce a native dblclick.
  var lastTap = null;
  var pointerStart = null;
  stream.addEventListener('pointerdown', function(event) {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    pointerStart = {image: event.target.closest('.page-img'), x: event.clientX,
      y: event.clientY, time: Date.now()};
  });
  stream.addEventListener('pointercancel', function() { pointerStart = null; lastTap = null; });
  stream.addEventListener('pointermove', function(event) {
    if (pointerStart && Math.hypot(event.clientX-pointerStart.x, event.clientY-pointerStart.y) > 10) {
      pointerStart = null; lastTap = null;
    }
  });
  stream.addEventListener('pointerup', function(event) {
    if (event.pointerType === 'mouse' || !pointerStart) return;
    var start = pointerStart;
    pointerStart = null;
    var now = Date.now();
    if (!start.image || start.image !== event.target.closest('.page-img') ||
        now - start.time > 300 || Math.hypot(event.clientX-start.x, event.clientY-start.y) > 10) {
      lastTap = null; return;
    }
    if (lastTap && lastTap.image === start.image && now-lastTap.time < 350) {
      clearTimeout(pageClickTimer);
      suppressPageClickUntil = now + 400;
      favoriteImage(start.image);
      lastTap = null;
    } else { lastTap = {image:start.image, time:now}; }
  });
})();
