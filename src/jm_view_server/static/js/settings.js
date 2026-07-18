function initSettingsPage() {
  var prefs = window.JmvPrefs;
  if (!prefs) return;

  document.getElementById('settingsHeroIcon').innerHTML = icon('settings');

  function notify(message) { if (window.toast) toast(message, 'success'); }
  function selectSegment(id, value) {
    document.querySelectorAll('#' + id + ' [data-value]').forEach(function(button) {
      button.classList.toggle('active', button.dataset.value === value);
    });
  }
  function bindSegment(id, prefName, callback) {
    var group = document.getElementById(id);
    selectSegment(id, prefs.get(prefName));
    group.addEventListener('click', function(event) {
      var button = event.target.closest('[data-value]');
      if (!button) return;
      var value = prefs.set(prefName, button.dataset.value);
      selectSegment(id, value);
      if (callback) callback(value);
      notify('设置已更新');
    });
  }
  function bindBoolean(id, prefName, invert, message) {
    var input = document.getElementById(id);
    input.checked = invert ? !prefs.get(prefName) : !!prefs.get(prefName);
    input.addEventListener('change', function() {
      prefs.set(prefName, invert ? !input.checked : input.checked);
      input.blur();
      notify(message || '设置已更新');
    });
  }
  function bindDeferredSwitch(id, prefName, message) {
    var button = document.getElementById(id);
    var scrollHost = document.querySelector('.settings-content');
    function render(value) { button.setAttribute('aria-checked', value ? 'true' : 'false'); }
    render(!!prefs.get(prefName));
    button.addEventListener('click', function() {
      var scrollTop = scrollHost ? scrollHost.scrollTop : 0;
      var value = button.getAttribute('aria-checked') !== 'true';
      prefs.set(prefName, value);
      render(value);
      notify(message);
      if (button.focus) {
        try { button.focus({ preventScroll: true }); } catch (e) { button.focus(); }
      }
      requestAnimationFrame(function() {
        if (scrollHost) scrollHost.scrollTop = scrollTop;
      });
    });
  }

  var themeSelect = document.getElementById('themeSelect');
  themeSelect.value = prefs.get('theme') || 'system';
  themeSelect.addEventListener('change', function() {
    var value = themeSelect.value;
    if (value === 'system') prefs.remove('theme'); else prefs.set('theme', value);
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', value === 'system' ? (prefersDark ? 'dark' : 'light') : value);
    document.querySelectorAll('.theme-toggle .knob').forEach(function(knob) {
      knob.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? icon('moon') : icon('sun');
    });
    notify('颜色模式已更新');
  });

  var swatches = window.APPEARANCE_SWATCHES || ['#5b5bd6', '#e5484d', '#f5a623', '#12a150', '#0ea5e9', '#d6409f', '#8b5cf6', '#111827'];
  var swatchHost = document.getElementById('brandSwatches');
  var brandPicker = document.getElementById('brandPicker');
  var currentBrand = prefs.get('brand') || window.APPEARANCE_DEFAULT_BRAND || '#5b5bd6';
  brandPicker.value = currentBrand;
  function paintSwatches(value) {
    swatchHost.querySelectorAll('button').forEach(function(button) { button.classList.toggle('active', button.dataset.color === value); });
  }
  swatches.forEach(function(color) {
    var button = document.createElement('button');
    button.type = 'button';
    button.dataset.color = color;
    button.style.background = color;
    button.setAttribute('aria-label', '主题色 ' + color);
    button.addEventListener('click', function() {
      prefs.set('brand', color); applyBrand(color); brandPicker.value = color; paintSwatches(color); notify('主题色已更新');
    });
    swatchHost.appendChild(button);
  });
  paintSwatches(currentBrand);
  brandPicker.addEventListener('input', function() { prefs.set('brand', brandPicker.value); applyBrand(brandPicker.value); paintSwatches(brandPicker.value); });
  brandPicker.addEventListener('change', function() { notify('主题色已更新'); });
  document.getElementById('brandReset').addEventListener('click', function() {
    prefs.remove('brand'); clearBrand(); brandPicker.value = window.APPEARANCE_DEFAULT_BRAND || '#5b5bd6'; paintSwatches(brandPicker.value); notify('主题色已恢复默认');
  });

  var opacity = document.getElementById('backgroundOpacity');
  var opacityValue = document.getElementById('backgroundOpacityValue');
  opacity.value = String(prefs.get('backgroundOpacity'));
  opacityValue.textContent = opacity.value + '%';
  opacity.addEventListener('input', function() {
    opacityValue.textContent = opacity.value + '%'; prefs.set('backgroundOpacity', opacity.value); applyBgOpacity(opacity.value);
  });
  opacity.addEventListener('change', function() { notify('背景淡化已更新'); });
  document.getElementById('backgroundFile').addEventListener('change', function() {
    var file = this.files && this.files[0];
    if (!file) return;
    var form = new FormData(); form.append('file', file);
    fetch('/api/upload_bg', { method: 'POST', body: form }).then(function(response) {
      if (!response.ok) throw new Error('upload failed'); return response.json();
    }).then(function() {
      var url = '/api/background?t=' + Date.now(); prefs.set('background', url); applyBgImage(url); applyBgOpacity(opacity.value); notify('背景图片已更新');
    }).catch(function() { if (window.toast) toast('背景图片上传失败', 'error'); });
    this.value = '';
  });
  document.getElementById('backgroundClear').addEventListener('click', function() {
    fetch('/api/background/clear', { method: 'POST' }).then(function(response) {
      if (!response.ok) throw new Error('clear failed'); prefs.remove('background'); applyBgImage(''); notify('背景图片已清除');
    }).catch(function() { if (window.toast) toast('背景图片清除失败', 'error'); });
  });

  bindSegment('browserViewSegment', 'browserView');
  bindDeferredSwitch('sidebarCollapsed', 'sidebarCollapsed', '已保存，刷新页面后生效');
  document.getElementById('sidebarWidthReset').addEventListener('click', function() {
    prefs.remove('sidebarWidth'); prefs.set('sidebarCollapsed', false); var app = document.querySelector('.app'); app.classList.remove('sidebar-collapsed'); app.style.removeProperty('--sidebar-w'); document.getElementById('sidebarCollapsed').setAttribute('aria-checked', 'false'); notify('侧栏宽度已恢复');
  });
  document.getElementById('columnWidthReset').addEventListener('click', function() {
    try { localStorage.removeItem('jmv-cols'); } catch (e) {} notify('列表列宽已恢复');
  });

  bindSegment('readerModeSegment', 'readerMode');
  bindSegment('singleFitSegment', 'singleFit', function(value) { document.getElementById('imageSize').disabled = value !== 'custom'; });
  var imageSize = document.getElementById('imageSize');
  var imageSizeValue = document.getElementById('imageSizeValue');
  imageSize.value = String(prefs.get('imageSize'));
  imageSizeValue.textContent = imageSize.value + 'px';
  imageSize.disabled = prefs.get('singleFit') !== 'custom';
  imageSize.addEventListener('input', function() {
    prefs.set('singleFit', 'custom'); selectSegment('singleFitSegment', 'custom'); imageSize.disabled = false; prefs.set('imageSize', imageSize.value); imageSizeValue.textContent = imageSize.value + 'px';
  });
  imageSize.addEventListener('change', function() { notify('图片大小已更新'); });
  bindBoolean('eyeCare', 'eyeCare', false);
  bindBoolean('headerVisible', 'headerHidden', true);
  bindBoolean('progressVisible', 'progressHidden', true);
  bindBoolean('autoNext', 'autoNext', false);

  var nickname = document.getElementById('chatNickname');
  nickname.value = prefs.get('chatNickname');
  nickname.addEventListener('change', function() { prefs.set('chatNickname', nickname.value.trim()); notify('默认昵称已更新'); });

  var shortcutGrid = document.getElementById('shortcutGrid');
  (window.JMV_READER_SHORTCUTS || []).forEach(function(item) {
    var row = document.createElement('div'); row.className = 'shortcut-row';
    row.innerHTML = '<span>' + item.keys.map(function(key) { return '<kbd>' + key + '</kbd>'; }).join('<i>或</i>') + '</span><b>' + item.label + '</b>';
    shortcutGrid.appendChild(row);
  });

  function readArrayCount(key) {
    try { var value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.length : 0; } catch (e) { return 0; }
  }
  function refreshCounts() {
    document.getElementById('bookmarkCount').textContent = readArrayCount('plugin_jm_bookmarks');
    document.getElementById('recentCount').textContent = readArrayCount('jmv-recent');
    document.getElementById('progressCount').textContent = prefs.countPrefix('jmv-progress:');
  }
  refreshCounts();
  document.querySelectorAll('[data-clear]').forEach(function(button) {
    button.addEventListener('click', function() {
      var type = button.dataset.clear;
      var labels = { bookmarks: '全部收藏目录', recent: '全部最近访问记录', progress: '全部漫画阅读进度' };
      if (!window.confirm('确定清除' + labels[type] + '？此操作无法撤销。')) return;
      if (type === 'bookmarks') localStorage.removeItem('plugin_jm_bookmarks');
      if (type === 'recent') localStorage.removeItem('jmv-recent');
      if (type === 'progress') prefs.clearPrefix('jmv-progress:');
      refreshCounts(); notify('本地数据已清理');
    });
  });

  document.getElementById('resetPreferences').addEventListener('click', function() {
    if (!window.confirm('恢复全部偏好默认值？收藏、最近目录和阅读进度不会被删除。')) return;
    prefs.resetPreferences(); window.location.reload();
  });
  document.getElementById('replayOnboarding').addEventListener('click', function() {
    try { localStorage.removeItem('jmv-onboarding-settings-v1'); } catch (e) {}
    if (window.showJmvOnboarding) window.showJmvOnboarding(true); else window.location.href = '/';
  });
}

window.initSettingsPage = initSettingsPage;
