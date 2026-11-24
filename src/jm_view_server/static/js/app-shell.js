/* ---------- 渲染 App Shell（侧栏 + 移动底栏），各页调用统一注入 ---------- */
function syncSidebarCollapseButton(collapsed) {
  var btn = document.getElementById('sidebarCollapseBtn');
  if (!btn) return;
  var label = collapsed ? '展开侧栏' : '收起侧栏';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('title', label);
  btn.setAttribute('aria-label', label);
  var span = btn.querySelector('span');
  if (span) span.textContent = label;
}

function renderShell(active) {
  // 注意：不放独立的“看本阅读”导航项——看本没有独立入口，
  // 它是从文件浏览页某个含图片的文件夹点“看本”按钮进入的（带 ?path=）。
  // 放一个 href=/ 的看本项会导致点击后回到文件首页、丢失当前目录 query。
  const nav = [
    { key: 'files',   label: '文件浏览', icon: 'folder',  href: '/' },
    { key: 'message', label: '局域网消息', icon: 'chat',  href: '/message' },
    { key: 'upload',  label: '上传文件', icon: 'upload',  href: '/upload_file' },
    { key: 'settings', label: '设置', icon: 'settings', href: '/settings' },
  ];
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <a href="/" class="sidebar-brand" title="jm-view-server 首页">
        <span class="brand-mark">${icon('book')}</span>
        <span class="brand-name">jm-view-server<small id="app-version-badge">本地看本</small></span>
      </a>
      <div class="nav">
        <div class="nav-label">浏览</div>
        ${nav.map(n => `<a href="${n.href}" class="nav-item ${n.key===active?'active':''}" title="${n.label}" aria-label="${n.label}"${n.key==='upload'?' data-jmv-upload-link':''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      </div>
      <div class="sidebar-foot">
        <div class="sidebar-theme-row">
          <span class="sidebar-theme-label">深色模式</span>
          <button type="button" class="theme-toggle" role="switch" aria-checked="false" aria-label="切换深色模式" onclick="toggleTheme(this)"><span class="knob"></span></button>
        </div>
        <button type="button" id="sidebarCollapseBtn" class="nav-item sidebar-collapse-btn" onclick="toggleSidebarCollapse(this)" aria-expanded="true" title="收起侧栏" aria-label="收起侧栏">${icon('panelLeft')}<span>收起侧栏</span></button>
        <a href="/logout" class="nav-item nav-item-danger" title="退出登录" aria-label="退出登录">${icon('logout')}<span>退出登录</span></a>
      </div>
      <div class="sidebar-resizer" id="sidebarResizer" title="拖拽调整宽度，拖到最窄自动折叠"></div>`;
  }
  initSidebarResize();
  const mbar = document.querySelector('.mobile-bar');
  if (mbar) {
    mbar.innerHTML = nav.map(n => `<a href="${n.href}" class="${n.key===active?'active':''}"${n.key==='upload'?' data-jmv-upload-link':''}>${icon(n.icon)}<span>${n.label.replace('局域网','')}</span></a>`).join('');
  }
  // 主题开关初始图标与无障碍状态
  if (window.syncThemeToggleControls) {
    syncThemeToggleControls(document.documentElement.getAttribute('data-theme'));
  }
  // 外观偏好兜底应用（背景遮罩层挂到 body，需在 body ready 后）
  applyAppearance();

  // 动态拉取后端版本号
  fetch('/api/info').then(r => r.json()).then(data => {
    const badge = document.getElementById('app-version-badge');
    if (badge && data.version) badge.textContent = `本地看本 · v${data.version}`;
  }).catch(e => console.error('Failed to fetch app version:', e));
  if (active === 'files' && window.location.pathname === '/') setTimeout(function() { showJmvOnboarding(false); }, 450);
}
window.renderShell = renderShell;

/* 侧栏拖拽改宽度：拖动时平滑跟随指针（含折叠态往右拖也能顺滑展开），
   只在“松手时”判定——最终宽度小于阈值才锁进折叠，否则保持该宽度。
   状态统一经 JmvPrefs 记忆。 */
var sidebarCollapseSeq = 0;

function initSidebarResize() {
  var app = document.querySelector('.app');
  var resizer = document.getElementById('sidebarResizer');
  if (!app || !resizer) return;
  app.classList.add('sidebar-initializing');

  var MIN = 180;          // 最小展开宽度
  var MAX = 420;          // 最大宽度
  var COLLAPSE_AT = 120;  // 松手时宽度低于此值 → 锁进折叠
  var COLLAPSED_W = 64;   // 折叠态视觉宽度（与 CSS 的 --sidebar-w 折叠值一致）

  // 恢复记忆的状态
  var initialCollapsed = window.JmvPrefs ? JmvPrefs.get('sidebarCollapsed') : false;
  if (initialCollapsed) {
    app.classList.add('sidebar-collapsed');
  } else if (window.JmvPrefs) {
    var w = JmvPrefs.get('sidebarWidth');
    if (w >= MIN && w <= MAX) app.style.setProperty('--sidebar-w', w + 'px');
  }
  syncSidebarCollapseButton(!!initialCollapsed);

  var initRaf1 = 0, initRaf2 = 0;
  initRaf1 = requestAnimationFrame(function() {
    initRaf1 = 0;
    initRaf2 = requestAnimationFrame(function() {
      initRaf2 = 0;
      app.classList.remove('sidebar-initializing');
    });
  });

  function cancelInitRafs() {
    if (initRaf1) { cancelAnimationFrame(initRaf1); initRaf1 = 0; }
    if (initRaf2) { cancelAnimationFrame(initRaf2); initRaf2 = 0; }
    app.classList.remove('sidebar-initializing');
  }

  function setCollapsed(on) {
    app.classList.toggle('sidebar-collapsed', on);
    syncSidebarCollapseButton(on);
    if (window.JmvPrefs) JmvPrefs.set('sidebarCollapsed', on);
  }

  var dragging = false;
  var activePointerId = null;
  var lastW = MIN;
  var grabDX = 0;
  var rafId = 0;
  var pendingClientX = null;

  function applyPendingWidth() {
    rafId = 0;
    if (!dragging || pendingClientX === null) return;
    var w = Math.max(COLLAPSED_W, Math.min(MAX, pendingClientX - grabDX));
    lastW = w;
    app.style.setProperty('--sidebar-w', w + 'px');
    app.classList.toggle('sidebar-precollapse', w < COLLAPSE_AT);
  }

  function finishDrag(finalClientX) {
    if (!dragging) return;
    if (typeof finalClientX === 'number') {
      pendingClientX = finalClientX;
    }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (pendingClientX !== null) {
      lastW = Math.max(COLLAPSED_W, Math.min(MAX, pendingClientX - grabDX));
    }
    dragging = false;
    activePointerId = null;
    pendingClientX = null;
    app.classList.remove('sidebar-precollapse');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (lastW < COLLAPSE_AT) {
      app.style.removeProperty('--sidebar-w');
      app.classList.remove('sidebar-dragging');
      setCollapsed(true);
    } else {
      var w = Math.max(MIN, Math.min(MAX, Math.round(lastW)));
      app.style.setProperty('--sidebar-w', w + 'px');
      app.classList.remove('sidebar-dragging');
      setCollapsed(false);
      if (window.JmvPrefs) JmvPrefs.set('sidebarWidth', w);
    }
  }

  resizer.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    sidebarCollapseSeq++;
    cancelInitRafs();
    dragging = true;
    activePointerId = e.pointerId;
    var rect = app.querySelector('.sidebar').getBoundingClientRect();
    grabDX = e.clientX - rect.right;
    lastW = rect.width;
    pendingClientX = e.clientX;

    if (app.classList.contains('sidebar-collapsed')) {
      app.style.setProperty('--sidebar-w', rect.width + 'px');
    }
    app.classList.remove('sidebar-collapsed');
    app.classList.add('sidebar-dragging');
    app.classList.toggle('sidebar-precollapse', rect.width < COLLAPSE_AT);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    try { resizer.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    pendingClientX = e.clientX;
    if (!rafId) rafId = requestAnimationFrame(applyPendingWidth);
  });

  resizer.addEventListener('pointerup', function (e) {
    if (e.pointerId === activePointerId) finishDrag(e.clientX);
  });
  resizer.addEventListener('pointercancel', function () { finishDrag(); });
  resizer.addEventListener('lostpointercapture', function () { finishDrag(); });
  window.addEventListener('blur', function () { finishDrag(); });
}
window.initSidebarResize = initSidebarResize;

function applySidebarCollapse() {
  var app = document.querySelector('.app');
  var sidebar = app && app.querySelector('.sidebar');
  if (!app || !sidebar) return;

  var seq = ++sidebarCollapseSeq;
  var isCollapsed = app.classList.contains('sidebar-collapsed');
  var currentW = sidebar.getBoundingClientRect().width;
  app.style.setProperty('--sidebar-w', currentW + 'px');

  if (isCollapsed) {
    app.classList.remove('sidebar-collapsed');
    syncSidebarCollapseButton(false);
    if (window.JmvPrefs) JmvPrefs.set('sidebarCollapsed', false);
    var saved = window.JmvPrefs ? JmvPrefs.get('sidebarWidth') : 244;
    var expandW = (saved >= 180 && saved <= 420) ? saved : 244;
    requestAnimationFrame(function() {
      if (seq !== sidebarCollapseSeq) return;
      requestAnimationFrame(function() {
        if (seq !== sidebarCollapseSeq || app.classList.contains('sidebar-dragging')) return;
        app.style.setProperty('--sidebar-w', expandW + 'px');
      });
    });
  } else {
    app.classList.add('sidebar-collapsed');
    syncSidebarCollapseButton(true);
    if (window.JmvPrefs) JmvPrefs.set('sidebarCollapsed', true);
    requestAnimationFrame(function() {
      if (seq !== sidebarCollapseSeq) return;
      requestAnimationFrame(function() {
        if (seq !== sidebarCollapseSeq || app.classList.contains('sidebar-dragging')) return;
        app.style.removeProperty('--sidebar-w');
      });
    });
  }
}

window.toggleSidebarCollapse = function(control) {
  if (control && window.runSettingsUpdate) {
    return window.runSettingsUpdate(control, applySidebarCollapse, { keepFocus: true });
  }
  return applySidebarCollapse();
};
