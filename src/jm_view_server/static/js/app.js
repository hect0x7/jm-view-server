/* ============================================================
   jm-view-server 原型 · 共享脚本
   主题切换 + toast + 复制地址 + 内联 SVG 图标
   所有页面复用此文件（取代旧版散落 3 份的 copyServerAddress）
   ============================================================ */

/* ---------- 内联 SVG 图标（本地，不依赖 FontAwesome CDN） ---------- */
const ICONS = {
  folder:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  images:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L9 20"/></svg>',
  chat:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>',
  upload:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  book:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  sun:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  logout:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2"/></svg>',
  star:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.3l5.9-.9z"/></svg>',
  search:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  grid:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  list:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  up:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  copy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  send:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  lock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  eye:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  fullscreen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
function icon(name) { return ICONS[name] || ''; }
window.icon = icon;

/* ---------- 主题：初始化 + 切换 + 记忆 ---------- */
(function initTheme() {
  const saved = localStorage.getItem('jmv-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('jmv-theme', next);
  document.querySelectorAll('.theme-toggle .knob').forEach(k => {
    k.innerHTML = next === 'dark' ? icon('moon') : icon('sun');
  });
}
window.toggleTheme = toggleTheme;

/* ---------- Toast 通知（统一，取代旧版各页自制 alert/notification） ---------- */
function toast(msg, type = 'default') {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;align-items:flex-end';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  const clr = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--brand)';
  el.style.cssText = `display:flex;align-items:center;gap:10px;background:var(--bg-elevated);border:1px solid var(--border);border-left:3px solid ${clr};box-shadow:var(--shadow-lg);border-radius:var(--r-md);padding:12px 16px;font-size:14px;color:var(--text);max-width:320px;transform:translateX(20px);opacity:0;transition:all .3s var(--ease)`;
  el.innerHTML = `<span style="color:${clr};display:grid;place-items:center;width:18px;height:18px">${type==='error'?icon('alert'):icon('check')}</span><span>${msg}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'none'; el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 300); }, 2600);
}
window.toast = toast;

/* ---------- 复制服务器地址（统一，用现代 clipboard API） ---------- */
function copyAddr(text) {
  const t = text || 'http://192.168.1.100:80';
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('服务器地址已复制', 'success'));
  else toast('已复制：' + t, 'success');
}
window.copyAddr = copyAddr;

/* ---------- 渲染 App Shell（侧栏 + 移动底栏），各页调用统一注入 ---------- */
function renderShell(active) {
  const nav = [
    { key: 'files',   label: '文件浏览', icon: 'folder',  href: '/' },
    { key: 'view',    label: '看本阅读', icon: 'book',    href: '/' },
    { key: 'message', label: '局域网消息', icon: 'chat',  href: '/message' },
    { key: 'upload',  label: '上传文件', icon: 'upload',  href: '/upload_file' },
  ];
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <a href="/" class="sidebar-brand">
        <span class="brand-mark">${icon('book')}</span>
        <span class="brand-name">jm-view-server<small>本地看本 · v0.2.4</small></span>
      </a>
      <div class="nav">
        <div class="nav-label">浏览</div>
        ${nav.map(n => `<a href="${n.href}" class="nav-item ${n.key===active?'active':''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      </div>
      <div class="sidebar-foot">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px">
          <span style="font-size:13px;color:var(--text-secondary)">深色模式</span>
          <div class="theme-toggle" onclick="toggleTheme()"><span class="knob"></span></div>
        </div>
        <a href="/logout" class="nav-item">${icon('logout')}<span>退出登录</span></a>
      </div>`;
  }
  const mbar = document.querySelector('.mobile-bar');
  if (mbar) {
    mbar.innerHTML = nav.map(n => `<a href="${n.href}" class="${n.key===active?'active':''}">${icon(n.icon)}<span>${n.label.replace('局域网','')}</span></a>`).join('');
  }
  // 主题开关初始图标
  document.querySelectorAll('.theme-toggle .knob').forEach(k => {
    k.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? icon('moon') : icon('sun');
  });
}
window.renderShell = renderShell;
