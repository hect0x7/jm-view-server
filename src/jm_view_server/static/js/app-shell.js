/* ---------- 渲染 App Shell（侧栏 + 移动底栏），各页调用统一注入 ---------- */
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
      <a href="/" class="sidebar-brand">
        <span class="brand-mark">${icon('book')}</span>
        <span class="brand-name">jm-view-server<small id="app-version-badge">本地看本</small></span>
      </a>
      <div class="nav">
        <div class="nav-label">浏览</div>
        ${nav.map(n => `<a href="${n.href}" class="nav-item ${n.key===active?'active':''}"${n.key==='upload'?' data-jmv-upload-link':''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      </div>
      <div class="sidebar-foot">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px">
          <span style="font-size:13px;color:var(--text-secondary)">深色模式</span>
          <div class="theme-toggle" onclick="toggleTheme(this)"><span class="knob"></span></div>
        </div>
        <button class="nav-item" onclick="toggleSidebarCollapse(this)" style="width:100%;text-align:left">${icon('panelLeft')}<span>收起/展开侧栏</span></button>
        <a href="/logout" class="nav-item">${icon('logout')}<span>退出登录</span></a>
      </div>
      <div class="sidebar-resizer" id="sidebarResizer" title="拖拽调整宽度，拖到最窄自动折叠"></div>`;
  }
  initSidebarResize();
  const mbar = document.querySelector('.mobile-bar');
  if (mbar) {
    mbar.innerHTML = nav.map(n => `<a href="${n.href}" class="${n.key===active?'active':''}"${n.key==='upload'?' data-jmv-upload-link':''}>${icon(n.icon)}<span>${n.label.replace('局域网','')}</span></a>`).join('');
  }
  // 主题开关初始图标
  document.querySelectorAll('.theme-toggle .knob').forEach(k => {
    k.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? icon('moon') : icon('sun');
  });
  // 外观偏好兜底应用（背景遮罩层挂到 body，需在 body ready 后）
  applyAppearance();

  // 动态拉取后端版本号
  fetch('/api/info').then(r => r.json()).then(data => {
    const badge = document.getElementById('app-version-badge');
    if (badge && data.version) badge.innerHTML = `本地看本 · v${data.version}`;
  }).catch(e => console.error('Failed to fetch app version:', e));
  if (active === 'files') setTimeout(function() { showJmvOnboarding(false); }, 450);
}
window.renderShell = renderShell;

/* 侧栏拖拽改宽度：拖动时平滑跟随鼠标（含折叠态往右拖也能顺滑展开），
   只在“松手时”判定——最终宽度小于阈值才锁进折叠，否则保持该宽度。
   状态记忆到 localStorage。 */
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
  try {
    if (localStorage.getItem('jmv-sidebar-collapsed') === '1') {
      app.classList.add('sidebar-collapsed');
    } else {
      var w = parseInt(localStorage.getItem('jmv-sidebar-w') || '', 10);
      if (w >= MIN && w <= MAX) app.style.setProperty('--sidebar-w', w + 'px');
    }
  } catch (e) {}
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      app.classList.remove('sidebar-initializing');
    });
  });

  function setCollapsed(on) {
    app.classList.toggle('sidebar-collapsed', on);
    try { localStorage.setItem('jmv-sidebar-collapsed', on ? '1' : '0'); } catch (e) {}
  }

  var dragging = false;
  var lastW = MIN;    // 拖动过程中记录的实时宽度
  var grabDX = 0;     // 按下点与侧栏右边缘的水平偏差，用于消抖（I-2）

  resizer.addEventListener('mousedown', function (e) {
    dragging = true;
    // 记录按下时鼠标 x 与侧栏当前右边缘的差值：拖动时用 (clientX - grabDX) 作为宽度，
    // 消除 resizer 有宽度/-6px 偏移导致的“起手跳一下”抖动（I-2）。
    var rect = app.querySelector('.sidebar').getBoundingClientRect();
    grabDX = e.clientX - rect.right;

    // 如果当前是折叠状态，在移除 class 前锁定当前物理宽度，避免瞬间回弹默认宽度导致的抖动
    if (app.classList.contains('sidebar-collapsed')) {
      app.style.setProperty('--sidebar-w', rect.width + 'px');
    }

    // 拖动期间脱离折叠 class，让宽度完全跟随鼠标（不受折叠布局限制），松手再定夺
    app.classList.remove('sidebar-collapsed');
    app.classList.add('sidebar-dragging');   // CSS 里 dragging 态关闭 --sidebar-w 过渡，避免拖动延迟

    // 起手时立即根据当前物理宽度判定是否需要加入“将要折叠”的预览虚化，避免拖动前一瞬间颜色跳变
    app.classList.toggle('sidebar-precollapse', rect.width < COLLAPSE_AT);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    // 平滑跟随（已补偿按下偏差）。允许缩到 COLLAPSED_W 让视觉连续，折叠判定留到松手。
    var w = Math.max(COLLAPSED_W, Math.min(MAX, e.clientX - grabDX));
    lastW = w;
    app.style.setProperty('--sidebar-w', w + 'px');
    // I-1：拖动中一旦低于折叠阈值，给个“将要折叠”的预览提示（不锁定，松手才定），
    // 用 class 让 CSS 淡化文字，明确区分“还没到阈值”与“已进入折叠意图区”。
    app.classList.toggle('sidebar-precollapse', w < COLLAPSE_AT);
  });

  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    app.classList.remove('sidebar-precollapse');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    if (lastW < COLLAPSE_AT) {
      // 松手时太窄 → 锁进折叠。先移除内联宽度再交回过渡，让 64px 折叠布局平滑落位（I-2）。
      app.style.removeProperty('--sidebar-w');
      app.classList.remove('sidebar-dragging');
      setCollapsed(true);
    } else {
      // 保持展开，夹到 [MIN, MAX] 并记忆
      var w = Math.max(MIN, Math.min(MAX, lastW));
      app.style.setProperty('--sidebar-w', w + 'px');
      app.classList.remove('sidebar-dragging');
      setCollapsed(false);
      try { localStorage.setItem('jmv-sidebar-w', w); } catch (e) {}
    }
  });
}
window.initSidebarResize = initSidebarResize;

function applySidebarCollapse() {
  var app = document.querySelector('.app');
  var sidebar = app.querySelector('.sidebar');
  if (!app || !sidebar) return;

  var isCollapsed = app.classList.contains('sidebar-collapsed');
  var currentW = sidebar.getBoundingClientRect().width;
  app.style.setProperty('--sidebar-w', currentW + 'px');

  if (isCollapsed) {
    app.classList.remove('sidebar-collapsed');
    requestAnimationFrame(function() {
      var saved = parseInt(localStorage.getItem('jmv-sidebar-w') || '', 10);
      var expandW = (saved >= 180 && saved <= 420) ? saved : 244;
      app.style.setProperty('--sidebar-w', expandW + 'px');
    });
    try { localStorage.setItem('jmv-sidebar-collapsed', '0'); } catch(e){}
  } else {
    app.classList.add('sidebar-collapsed');
    requestAnimationFrame(function() {
      app.style.removeProperty('--sidebar-w');
    });
    try { localStorage.setItem('jmv-sidebar-collapsed', '1'); } catch(e){}
  }
}

window.toggleSidebarCollapse = function(control) {
  if (control && window.runSettingsUpdate) {
    return window.runSettingsUpdate(control, applySidebarCollapse, { keepFocus: true });
  }
  return applySidebarCollapse();
};
