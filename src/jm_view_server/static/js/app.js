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
  autoNext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
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
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5A5.5 5.5 0 0 1 14.5 20H11"/></svg>',
  check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  lock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  eye:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  fullscreen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/></svg>',
  arrowDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  more:    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  file:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  link:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/><path d="m15 3 6 0 0 6"/><path d="m21 3-7 7"/></svg>',
  // 图片适配模式图标（四角向内箭头，示意“适配到框内”）
  panelTop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  panelBottom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
  panelLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  slider: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg>',
  fit:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M3 15v4a2 2 0 0 0 2 2h4M8 8l3 3M16 8l-3 3M8 16l3-3M16 16l-3-3"/></svg>',
  // 护眼滤镜图标（灯泡/暖光）
  eyecare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  // 调色板图标（外观设置入口）
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.6-.2-1.2-.6-1.6-.4-.5-.6-1-.6-1.6a2.5 2.5 0 0 1 2.5-2.5H18a4 4 0 0 0 4-4c0-4.5-4.5-8-10-8z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
};
function icon(name) { return ICONS[name] || ''; }

/* 按文件名扩展名判断是否图片，用于选文件图标（图片→images，其它→file）。 */
var IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','bmp','avif','jfif','tiff','svg'];
function isImageName(name) {
  var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return !!m && IMAGE_EXTS.indexOf(m[1].toLowerCase()) !== -1;
}
window.isImageName = isImageName;
window.icon = icon;

/* ---------- 浏览器偏好：统一 key、默认值与类型转换 ---------- */
var JMV_PREF_DEFS = {
  theme: { key: 'jmv-theme', type: 'enum', values: ['light', 'dark'], fallback: '' },
  brand: { key: 'jmv-brand', type: 'string', fallback: '' },
  background: { key: 'jmv-bg', type: 'string', fallback: '' },
  backgroundOpacity: { key: 'jmv-bg-opacity', type: 'number', min: 0, max: 100, fallback: 0 },
  sidebarCollapsed: { key: 'jmv-sidebar-collapsed', type: 'bool', fallback: false },
  sidebarWidth: { key: 'jmv-sidebar-w', type: 'number', min: 180, max: 420, fallback: 248 },
  browserView: { key: 'jmv-view', type: 'enum', values: ['list', 'grid'], fallback: 'list' },
  readerMode: { key: 'jmv-reader-mode', type: 'enum', values: ['scroll', 'single', 'double'], fallback: 'scroll' },
  readingDirection: { key: 'jmv-reading-direction', type: 'enum', values: ['ltr', 'rtl'], fallback: 'ltr' },
  doubleWidthScale: { key: 'jmv-double-width-scale', type: 'number', min: 50, max: 100, fallback: 98 },
  singleFit: { key: 'jmv-single-fit', type: 'enum', values: ['contain', 'custom'], fallback: 'contain' },
  imageSize: { key: 'jmv-img-custom-size', type: 'number', min: 300, max: 1600, fallback: 800 },
  eyeCare: { key: 'jmv-eyecare', type: 'bool', fallback: false },
  headerHidden: { key: 'jmv-head-hidden', type: 'bool', fallback: true },
  progressHidden: { key: 'jmv-prog-hidden', type: 'bool', fallback: false },
  autoNext: { key: 'jmv-auto-next', type: 'bool', fallback: false },
  chatNickname: { key: 'jm_chat_nickname', type: 'string', fallback: '' }
};

function normalizeNumberPreference(def, value) {
  var numberValue = parseInt(value, 10);
  if (isNaN(numberValue)) return def.fallback;
  return Math.max(def.min, Math.min(def.max, numberValue));
}

function parsePreference(def, raw) {
  if (raw == null || raw === '') return def.fallback;
  if (def.type === 'bool') return raw === '1' || raw === 'true';
  if (def.type === 'number') return normalizeNumberPreference(def, raw);
  if (def.type === 'enum') return def.values.indexOf(raw) >= 0 ? raw : def.fallback;
  return String(raw);
}

function serializePreference(def, value) {
  if (def.type === 'bool') return value ? '1' : '0';
  if (def.type === 'number') return String(normalizeNumberPreference(def, value));
  if (def.type === 'enum') return def.values.indexOf(value) >= 0 ? value : def.fallback;
  return String(value == null ? '' : value);
}

function formatDoubleWidthScale(value) {
  var percentage = parseInt(value, 10);
  if (isNaN(percentage)) percentage = 98;
  return Math.max(50, Math.min(100, percentage)) + '%';
}
window.formatDoubleWidthScale = formatDoubleWidthScale;

var JmvPrefs = {
  definitions: JMV_PREF_DEFS,
  get: function(name) {
    var def = JMV_PREF_DEFS[name];
    if (!def) return null;
    try { return parsePreference(def, localStorage.getItem(def.key)); }
    catch (e) { return def.fallback; }
  },
  set: function(name, value) {
    var def = JMV_PREF_DEFS[name];
    if (!def) return null;
    var serialized = serializePreference(def, value);
    try {
      if (serialized === '' && def.fallback === '') localStorage.removeItem(def.key);
      else localStorage.setItem(def.key, serialized);
    } catch (e) {}
    var parsed = parsePreference(def, serialized);
    window.dispatchEvent(new CustomEvent('jmv:preference-change', { detail: { name: name, value: parsed } }));
    return parsed;
  },
  remove: function(name) {
    var def = JMV_PREF_DEFS[name];
    if (!def) return;
    try { localStorage.removeItem(def.key); } catch (e) {}
    window.dispatchEvent(new CustomEvent('jmv:preference-change', { detail: { name: name, value: def.fallback } }));
  },
  resetPreferences: function() {
    Object.keys(JMV_PREF_DEFS).forEach(function(name) { JmvPrefs.remove(name); });
  },
  countPrefix: function(prefix) {
    var count = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        if ((localStorage.key(i) || '').indexOf(prefix) === 0) count++;
      }
    } catch (e) {}
    return count;
  },
  clearPrefix: function(prefix) {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i) || '';
        if (key.indexOf(prefix) === 0) keys.push(key);
      }
      keys.forEach(function(key) { localStorage.removeItem(key); });
    } catch (e) {}
    return keys.length;
  }
};
window.JmvPrefs = JmvPrefs;

window.JMV_READER_SHORTCUTS = [
  { keys: ['←'], label: '单页：上一页；连续模式：无操作' },
  { keys: ['→'], label: '单页：下一页；连续模式：无操作' },
  { keys: ['PageUp'], label: '单页：向上滚动，页首后上一页；连续模式：向上滚动' },
  { keys: ['PageDown', 'Space'], label: '单页：向下滚动，页尾后下一页；连续模式：向下滚动' },
  { keys: ['Home', 'End'], label: '第一 / 最后一页' },
  { keys: ['G'], label: '跳转页码' },
  { keys: ['T'], label: '打开 / 关闭缩略图总览' },
  { keys: ['M'], label: '切换下拉 / 单页 / 双页' },
  { keys: ['F'], label: '切换全屏' },
  { keys: ['H'], label: '固定 / 自动收起阅读工具栏' },
  { keys: ['?'], label: '快捷键帮助' },
  { keys: ['Esc'], label: '关闭当前浮层' }
];

/* ---------- 主题：初始化 + 切换 + 记忆 ---------- */
(function initTheme() {
  const saved = localStorage.getItem('jmv-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function applyThemeToggle() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('jmv-theme', next);
  document.querySelectorAll('.theme-toggle .knob').forEach(k => {
    k.innerHTML = next === 'dark' ? icon('moon') : icon('sun');
  });
}
function toggleTheme(control) {
  if (control && window.runSettingsUpdate) {
    return window.runSettingsUpdate(control, applyThemeToggle, { keepFocus: true });
  }
  return applyThemeToggle();
}
window.toggleTheme = toggleTheme;

/* ============================================================
   自定义外观：主题色 + 背景图 + 背景透明度
   全部记 localStorage，进入时恢复。applyAppearance() 幂等，
   在脚本加载时先跑一次（尽早应用，避免闪烁），renderShell 里再跑一次兜底。
   ============================================================ */
var APPEARANCE_DEFAULT_BRAND = '#5b5bd6';

/* #rrggbb → {r,g,b}。非法输入返回 null。 */
function hexToRgb(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  var n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* 把颜色按比例往黑色靠（factor 0~1，0.14≈稍暗），用于 --brand-hover。 */
function darken(hex, factor) {
  var c = hexToRgb(hex); if (!c) return hex;
  var f = 1 - factor;
  var to = function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); };
  return '#' + [to(c.r), to(c.g), to(c.b)].map(function (v) {
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

/* 应用主题色：由单一 --brand 派生 hover/soft/ring 一整套变量。 */
function applyBrand(hex) {
  var root = document.documentElement;
  var c = hexToRgb(hex);
  if (!c) return;
  root.style.setProperty('--brand', hex);
  root.style.setProperty('--brand-hover', darken(hex, 0.14));
  root.style.setProperty('--brand-soft', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.12)');
  root.style.setProperty('--brand-ring', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.30)');
}

/* 清除自定义主题色，回落到 CSS 里定义的默认（含深/浅两套）。 */
function clearBrand() {
  var root = document.documentElement;
  ['--brand', '--brand-hover', '--brand-soft', '--brand-ring'].forEach(function (v) {
    root.style.removeProperty(v);
  });
}

/* 保证背景遮罩层存在（body 直挂一个固定定位的淡化层）。 */
function ensureBgMask() {
  var mask = document.getElementById('appBgMask');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'appBgMask';
    document.body.appendChild(mask);
  }
  return mask;
}

/* 应用背景图 url（空则清除）。遮罩层随之显隐。 */
function applyBgImage(url) {
  var mask = ensureBgMask();
  if (url) {
    document.body.classList.add('has-bg');
    document.body.style.backgroundImage = "url('" + url + "')";
  } else {
    document.body.classList.remove('has-bg');
    document.body.style.backgroundImage = '';
    mask.style.opacity = '0';
  }
}

/* 应用背景遮罩透明度（0~100，越大背景越淡）。无背景图时无视觉效果。 */
function applyBgOpacity(pct) {
  var mask = ensureBgMask();
  var v = Math.max(0, Math.min(100, parseInt(pct, 10) || 0));
  mask.style.opacity = document.body.classList.contains('has-bg') ? (v / 100) : '0';
}

/* 从 localStorage 恢复并应用全部外观偏好。幂等。 */
function applyAppearance() {
  try {
    var brand = localStorage.getItem('jmv-brand');
    if (brand) applyBrand(brand);
    var bg = localStorage.getItem('jmv-bg');
    if (bg) applyBgImage(bg);
    var op = localStorage.getItem('jmv-bg-opacity');
    applyBgOpacity(op == null ? 0 : op);
  } catch (e) {}
}
window.applyAppearance = applyAppearance;
// 尽早应用（body 此时可能还没 ready，用 DOMContentLoaded 兜底）
if (document.body) applyAppearance();
else document.addEventListener('DOMContentLoaded', applyAppearance);

/* ---------- 外观设置面板（居中 modal，随深浅主题） ---------- */
var APPEARANCE_SWATCHES = ['#5b5bd6', '#e5484d', '#f5a623', '#12a150', '#0ea5e9', '#d6409f', '#8b5cf6', '#111827'];

function openAppearance() {
  var old = document.getElementById('appearanceModal');
  if (old) old.remove();

  var curBrand = localStorage.getItem('jmv-brand') || APPEARANCE_DEFAULT_BRAND;
  var curOpacity = localStorage.getItem('jmv-bg-opacity');
  curOpacity = curOpacity == null ? 0 : parseInt(curOpacity, 10) || 0;
  var hasBg = !!localStorage.getItem('jmv-bg');

  var overlay = document.createElement('div');
  overlay.id = 'appearanceModal';
  overlay.className = 'appearance-overlay';
  overlay.innerHTML =
    '<div class="appearance-modal" role="dialog" aria-label="外观设置">' +
      '<div class="appearance-head">' +
        '<span class="appearance-title">' + icon('palette') + '外观设置</span>' +
        '<button class="appearance-close" id="apClose" title="关闭">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="appearance-body">' +
        '<section class="appearance-sec">' +
          '<div class="appearance-sec-label">主题色</div>' +
          '<div class="appearance-swatches" id="apSwatches">' +
            APPEARANCE_SWATCHES.map(function (c) {
              return '<button class="appearance-swatch" data-color="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
            }).join('') +
          '</div>' +
          '<div class="appearance-row">' +
            '<label class="appearance-color-pick">' +
              '<input type="color" id="apColor" value="' + curBrand + '">' +
              '<span>自定义取色</span>' +
            '</label>' +
            '<button class="btn btn-ghost btn-sm" id="apBrandReset">恢复默认</button>' +
          '</div>' +
        '</section>' +
        '<section class="appearance-sec">' +
          '<div class="appearance-sec-label">背景图</div>' +
          '<div class="appearance-row">' +
            '<button class="btn btn-primary btn-sm" id="apUpload">' + icon('upload') + '上传背景图</button>' +
            '<button class="btn btn-ghost btn-sm" id="apClearBg">清除背景</button>' +
          '</div>' +
          '<input type="file" id="apFile" accept="image/*" hidden>' +
        '</section>' +
        '<section class="appearance-sec">' +
          '<div class="appearance-sec-label">背景淡化 <small id="apOpacityVal">' + curOpacity + '%</small></div>' +
          '<input type="range" id="apOpacity" class="appearance-range" min="0" max="100" value="' + curOpacity + '"' + (hasBg ? '' : ' disabled') + '>' +
          '<div class="appearance-hint">越高背景越淡、内容越清晰。无背景图时不可用。</div>' +
        '</section>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('open'); });

  function close() { overlay.classList.remove('open'); setTimeout(function () { overlay.remove(); }, 220); }
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('#apClose').addEventListener('click', close);

  var colorInput = overlay.querySelector('#apColor');
  function setBrand(hex) {
    applyBrand(hex);
    try { localStorage.setItem('jmv-brand', hex); } catch (e) {}
    colorInput.value = hex;
  }
  overlay.querySelector('#apSwatches').addEventListener('click', function (e) {
    var btn = e.target.closest('.appearance-swatch');
    if (btn) setBrand(btn.getAttribute('data-color'));
  });
  colorInput.addEventListener('input', function () { setBrand(colorInput.value); });
  overlay.querySelector('#apBrandReset').addEventListener('click', function () {
    clearBrand();
    try { localStorage.removeItem('jmv-brand'); } catch (e) {}
    colorInput.value = APPEARANCE_DEFAULT_BRAND;
    toast('已恢复默认主题色', 'success');
  });

  var opacity = overlay.querySelector('#apOpacity');
  var opacityVal = overlay.querySelector('#apOpacityVal');
  opacity.addEventListener('input', function () {
    opacityVal.textContent = opacity.value + '%';
    applyBgOpacity(opacity.value);
    try { localStorage.setItem('jmv-bg-opacity', opacity.value); } catch (e) {}
  });

  var fileInput = overlay.querySelector('#apFile');
  overlay.querySelector('#apUpload').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('file', f);
    fetch('/api/upload_bg', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j && res.j.status === 'ok' && res.j.url) {
          var url = res.j.url;
          applyBgImage(url);
          try { localStorage.setItem('jmv-bg', url); } catch (e) {}
          opacity.disabled = false;
          applyBgOpacity(opacity.value);
          toast('背景图已更新', 'success');
        } else {
          toast('上传失败：请选图片文件', 'error');
        }
      })
      .catch(function () { toast('上传失败', 'error'); })
      .finally(function () { fileInput.value = ''; });
  });

  overlay.querySelector('#apClearBg').addEventListener('click', function () {
    fetch('/api/background/clear', { method: 'POST' }).catch(function () {});
    applyBgImage('');
    try { localStorage.removeItem('jmv-bg'); } catch (e) {}
    opacity.disabled = true;
    toast('已清除背景图', 'success');
  });
}
window.openAppearance = openAppearance;

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
  el.innerHTML = `<span style="color:${clr};display:grid;place-items:center;width:18px;height:18px;flex-shrink:0">${type==='error'?icon('alert'):icon('check')}</span><span style="flex:1">${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0 4px;font-size:16px;line-height:1;margin-left:4px" aria-label="关闭">×</button>`;
  el.onclick = function(e) { if(e.target.tagName !== 'BUTTON') el.remove(); };
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'none'; el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 300); }, 2600);
}
window.toast = toast;

/* ---------- 首次使用引导：版本化、每个浏览器只自动展示一次 ---------- */
function showJmvOnboarding(force) {
  var key = 'jmv-onboarding-settings-v1';
  try { if (!force && localStorage.getItem(key) === '1') return; } catch (e) {}
  var old = document.getElementById('jmvOnboarding');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'jmvOnboarding';
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <div class="onboarding-kicker">Quick field guide</div>
      <h2 id="onboardingTitle">新的阅读方式，先看这三件事</h2>
      <div class="onboarding-steps">
        <div><span>01</span><b>设置集中管理</b><p>在设置页提前选择外观、默认阅读模式、图片大小和自动连播。</p></div>
        <div><span>02</span><b>三种阅读布局</b><p>单页模式点击两侧翻页；双页模式在桌面端每行两页，窄屏自动单列并连续滚动。</p></div>
        <div><span>03</span><b>快捷键随时可查</b><p>方向键翻页，按 M 切换模式，按 ? 打开完整快捷键帮助。</p></div>
      </div>
      <div class="onboarding-actions">
        <button class="btn btn-outline" data-action="start">开始使用</button>
        <button class="btn btn-primary" data-action="settings">去设置</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('show'); });
  var firstButton = overlay.querySelector('[data-action="start"]');
  firstButton.focus();
  function complete(destination) {
    try { localStorage.setItem(key, '1'); } catch (e) {}
    overlay.classList.remove('show');
    setTimeout(function() {
      overlay.remove();
      if (destination) window.location.href = destination;
    }, 180);
  }
  overlay.addEventListener('click', function(event) {
    var action = event.target.closest('[data-action]');
    if (!action) return;
    complete(action.dataset.action === 'settings' ? '/settings' : '');
  });
  overlay.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') complete('');
  });
}
window.showJmvOnboarding = showJmvOnboarding;

/* ---------- 复制服务器地址（统一，用现代 clipboard API） ---------- */
function copyAddr(text) {
  const t = text || 'http://192.168.1.100:80';
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('服务器地址已复制', 'success'));
  else toast('已复制：' + t, 'success');
}
window.copyAddr = copyAddr;

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
        ${nav.map(n => `<a href="${n.href}" class="nav-item ${n.key===active?'active':''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
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
    mbar.innerHTML = nav.map(n => `<a href="${n.href}" class="${n.key===active?'active':''}">${icon(n.icon)}<span>${n.label.replace('局域网','')}</span></a>`).join('');
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
