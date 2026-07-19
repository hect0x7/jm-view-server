function initSettingsPage() {
  var prefs = window.JmvPrefs;
  if (!prefs) return;

  document.getElementById('settingsHeroIcon').innerHTML = icon('settings');

  var scrollHost = document.querySelector('.settings-content');
  var settingsMain = document.querySelector('.settings-main');
  var interactionSnapshots = new WeakMap();
  var activeTransaction = null;

  function clearInteractionSnapshots() {
    interactionSnapshots = new WeakMap();
  }

  function resolveControl(target) {
    if (!target) return null;
    if (target.nodeType !== 1) target = target.parentElement;
    if (!target) return null;
    var label = target.closest && target.closest('label');
    if (label && label.control) return label.control;
    return target.closest ? target.closest('button, input, select, textarea, [role="switch"], [data-value]') || target : target;
  }

  function findVisibleSettingsAnchor() {
    if (!scrollHost) return null;
    var hostRect = scrollHost.getBoundingClientRect();
    var candidates = scrollHost.querySelectorAll('.settings-card, .settings-data-card, .settings-section');
    for (var index = 0; index < candidates.length; index++) {
      var rect = candidates[index].getBoundingClientRect();
      if (rect.bottom > hostRect.top + 8 && rect.top < hostRect.bottom - 8) return candidates[index];
    }
    return settingsMain || scrollHost.firstElementChild;
  }

  function captureSettingsAnchor(target) {
    var control = resolveControl(target);
    var anchor = control && scrollHost && scrollHost.contains(control) ? control : findVisibleSettingsAnchor();
    return {
      control: control,
      anchor: anchor,
      anchorTop: anchor ? anchor.getBoundingClientRect().top : 0,
      scrollTop: scrollHost ? scrollHost.scrollTop : 0
    };
  }

  function rememberInteraction(event) {
    if (activeTransaction) activeTransaction.cancel();
    var control = resolveControl(event.target);
    if (!control) return;
    if (event.type === 'click' && interactionSnapshots.has(control)) return;
    clearInteractionSnapshots();
    interactionSnapshots.set(control, captureSettingsAnchor(control));
  }

  function cancelActiveTransaction() {
    if (activeTransaction) activeTransaction.cancel();
    clearInteractionSnapshots();
  }

  if (scrollHost) {
    scrollHost.addEventListener('pointerdown', rememberInteraction, true);
    scrollHost.addEventListener('click', rememberInteraction, true);
    scrollHost.addEventListener('wheel', cancelActiveTransaction, true);
    scrollHost.addEventListener('touchstart', cancelActiveTransaction, true);
  }
  document.querySelectorAll('.sidebar .theme-toggle, .sidebar button[onclick*="toggleSidebarCollapse"]').forEach(function(control) {
    control.addEventListener('pointerdown', rememberInteraction, true);
    control.addEventListener('click', rememberInteraction, true);
  });

  function runSettingsUpdate(target, mutation, options) {
    options = options || {};
    if (activeTransaction) activeTransaction.cancel();
    var control = resolveControl(target) || resolveControl(document.activeElement);
    var snapshot = control && interactionSnapshots.get(control);
    if (control) interactionSnapshots.delete(control);
    if (!snapshot) snapshot = captureSettingsAnchor(control || target || document.activeElement);

    var cancelled = false;
    var animationFrames = [];
    var timers = [];
    var resizeObserver = null;
    var cleanupDelay = 400;

    function restoreAnchor() {
      if (cancelled || !scrollHost) return;
      if (snapshot.anchor && snapshot.anchor.isConnected) {
        var delta = snapshot.anchor.getBoundingClientRect().top - snapshot.anchorTop;
        if (Math.abs(delta) > 0.1) scrollHost.scrollTop += delta;
      } else {
        scrollHost.scrollTop = snapshot.scrollTop;
      }
    }

    function restoreFocus() {
      if (cancelled || !options.keepFocus || !snapshot.control || !snapshot.control.isConnected || !snapshot.control.focus) return;
      try { snapshot.control.focus({ preventScroll: true }); } catch (error) { snapshot.control.focus(); restoreAnchor(); }
    }

    function queueAnimationFrameRestores() {
      if (cancelled) return;
      animationFrames.push(requestAnimationFrame(function() {
        restoreAnchor();
        if (cancelled) return;
        animationFrames.push(requestAnimationFrame(restoreAnchor));
      }));
    }

    function queueRestore(delay) {
      if (cancelled) return;
      timers.push(setTimeout(restoreAnchor, delay));
    }

    function cancel() {
      if (cancelled) return;
      cancelled = true;
      animationFrames.forEach(function(id) { cancelAnimationFrame(id); });
      timers.forEach(function(id) { clearTimeout(id); });
      if (resizeObserver) resizeObserver.disconnect();
      if (scrollHost) scrollHost.classList.remove('settings-preserve-scroll');
      if (activeTransaction && activeTransaction.cancel === cancel) activeTransaction = null;
    }

    function cleanup() {
      if (cancelled) return;
      restoreAnchor();
      cancel();
    }

    function scheduleCleanup(delay) {
      if (cancelled) return;
      timers.push(setTimeout(cleanup, delay));
    }

    activeTransaction = { cancel: cancel, cleanup: cleanup };
    if (scrollHost) scrollHost.classList.add('settings-preserve-scroll');
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(restoreAnchor);
      if (settingsMain) resizeObserver.observe(settingsMain);
      if (snapshot.anchor && snapshot.anchor !== settingsMain) resizeObserver.observe(snapshot.anchor);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        if (cancelled) return;
        restoreAnchor();
        queueAnimationFrameRestores();
      });
    }

    var result;
    try {
      result = mutation();
    } catch (error) {
      restoreFocus();
      restoreAnchor();
      queueAnimationFrameRestores();
      scheduleCleanup(cleanupDelay);
      throw error;
    }

    restoreFocus();
    restoreAnchor();
    queueAnimationFrameRestores();
    queueRestore(50);
    queueRestore(100);
    queueRestore(200);

    if (result && typeof result.then === 'function') {
      scheduleCleanup(3000);
      return Promise.resolve(result).then(function(value) {
        restoreFocus();
        restoreAnchor();
        queueAnimationFrameRestores();
        queueRestore(100);
        scheduleCleanup(cleanupDelay);
        return value;
      }, function(error) {
        restoreFocus();
        restoreAnchor();
        queueAnimationFrameRestores();
        queueRestore(100);
        scheduleCleanup(cleanupDelay);
        throw error;
      });
    }

    scheduleCleanup(cleanupDelay);
    return result;
  }
  window.runSettingsUpdate = runSettingsUpdate;

  function notify(message, type) {
    if (window.toast) toast(message, type || 'success');
  }

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
      event.preventDefault();
      runSettingsUpdate(button, function() {
        var value = prefs.set(prefName, button.dataset.value);
        selectSegment(id, value);
        if (callback) callback(value);
        notify('设置已更新');
      }, { keepFocus: true });
    });
  }

  function bindBoolean(id, prefName, invert, message) {
    var input = document.getElementById(id);
    input.checked = invert ? !prefs.get(prefName) : !!prefs.get(prefName);
    input.addEventListener('change', function() {
      runSettingsUpdate(input, function() {
        prefs.set(prefName, invert ? !input.checked : input.checked);
        notify(message || '设置已更新');
      }, { keepFocus: true });
    });
  }

  function bindDeferredSwitch(id, prefName, message) {
    var button = document.getElementById(id);
    function render(value) { button.setAttribute('aria-checked', value ? 'true' : 'false'); }
    render(!!prefs.get(prefName));
    button.addEventListener('click', function() {
      runSettingsUpdate(button, function() {
        var value = button.getAttribute('aria-checked') !== 'true';
        prefs.set(prefName, value);
        render(value);
        notify(message);
      }, { keepFocus: true });
    });
  }

  var themeSelect = document.getElementById('themeSelect');
  themeSelect.value = prefs.get('theme') || 'system';
  themeSelect.addEventListener('change', function() {
    runSettingsUpdate(themeSelect, function() {
      var value = themeSelect.value;
      if (value === 'system') prefs.remove('theme'); else prefs.set('theme', value);
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', value === 'system' ? (prefersDark ? 'dark' : 'light') : value);
      document.querySelectorAll('.theme-toggle .knob').forEach(function(knob) {
        knob.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? icon('moon') : icon('sun');
      });
      notify('颜色模式已更新');
    }, { keepFocus: true });
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
      runSettingsUpdate(button, function() {
        prefs.set('brand', color);
        applyBrand(color);
        brandPicker.value = color;
        paintSwatches(color);
        notify('主题色已更新');
      }, { keepFocus: true });
    });
    swatchHost.appendChild(button);
  });
  paintSwatches(currentBrand);
  brandPicker.addEventListener('input', function() {
    runSettingsUpdate(brandPicker, function() {
      prefs.set('brand', brandPicker.value);
      applyBrand(brandPicker.value);
      paintSwatches(brandPicker.value);
    }, { keepFocus: true });
  });
  brandPicker.addEventListener('change', function() {
    runSettingsUpdate(brandPicker, function() { notify('主题色已更新'); }, { keepFocus: true });
  });
  document.getElementById('brandReset').addEventListener('click', function(event) {
    runSettingsUpdate(event.currentTarget, function() {
      prefs.remove('brand');
      clearBrand();
      brandPicker.value = window.APPEARANCE_DEFAULT_BRAND || '#5b5bd6';
      paintSwatches(brandPicker.value);
      notify('主题色已恢复默认');
    }, { keepFocus: true });
  });

  var opacity = document.getElementById('backgroundOpacity');
  var opacityValue = document.getElementById('backgroundOpacityValue');
  opacity.value = String(prefs.get('backgroundOpacity'));
  opacityValue.textContent = opacity.value + '%';
  opacity.addEventListener('input', function() {
    runSettingsUpdate(opacity, function() {
      opacityValue.textContent = opacity.value + '%';
      prefs.set('backgroundOpacity', opacity.value);
      applyBgOpacity(opacity.value);
    }, { keepFocus: true });
  });
  opacity.addEventListener('change', function() {
    runSettingsUpdate(opacity, function() { notify('背景淡化已更新'); }, { keepFocus: true });
  });

  var backgroundFile = document.getElementById('backgroundFile');
  backgroundFile.addEventListener('change', function() {
    var file = backgroundFile.files && backgroundFile.files[0];
    if (!file) return;
    runSettingsUpdate(backgroundFile, function() {
      var form = new FormData();
      form.append('file', file);
      backgroundFile.value = '';
      return fetch('/api/upload_bg', { method: 'POST', body: form }).then(function(response) {
        if (!response.ok) throw new Error('upload failed');
        return response.json();
      }).then(function() {
        var url = '/api/background?t=' + Date.now();
        prefs.set('background', url);
        applyBgImage(url);
        applyBgOpacity(opacity.value);
        notify('背景图片已更新');
      }).catch(function() { notify('背景图片上传失败', 'error'); });
    }, { keepFocus: true });
  });

  var backgroundClear = document.getElementById('backgroundClear');
  backgroundClear.addEventListener('click', function() {
    runSettingsUpdate(backgroundClear, function() {
      return fetch('/api/background/clear', { method: 'POST' }).then(function(response) {
        if (!response.ok) throw new Error('clear failed');
        prefs.remove('background');
        applyBgImage('');
        notify('背景图片已清除');
      }).catch(function() { notify('背景图片清除失败', 'error'); });
    }, { keepFocus: true });
  });

  bindSegment('browserViewSegment', 'browserView');
  bindDeferredSwitch('sidebarCollapsed', 'sidebarCollapsed', '已保存，刷新页面后生效');
  document.getElementById('sidebarWidthReset').addEventListener('click', function(event) {
    runSettingsUpdate(event.currentTarget, function() {
      prefs.remove('sidebarWidth');
      prefs.set('sidebarCollapsed', false);
      var app = document.querySelector('.app');
      app.classList.remove('sidebar-collapsed');
      app.style.removeProperty('--sidebar-w');
      document.getElementById('sidebarCollapsed').setAttribute('aria-checked', 'false');
      notify('侧栏宽度已恢复');
    }, { keepFocus: true });
  });
  document.getElementById('columnWidthReset').addEventListener('click', function(event) {
    runSettingsUpdate(event.currentTarget, function() {
      try { localStorage.removeItem('jmv-cols'); } catch (error) {}
      notify('列表列宽已恢复');
    }, { keepFocus: true });
  });

  bindSegment('readerModeSegment', 'readerMode');
  bindSegment('readingDirectionSegment', 'readingDirection');
  var doubleWidthScale = document.getElementById('doubleWidthScale');
  var doubleWidthScaleValue = document.getElementById('doubleWidthScaleValue');
  doubleWidthScale.value = String(prefs.get('doubleWidthScale'));
  doubleWidthScaleValue.textContent = formatDoubleWidthScale(doubleWidthScale.value);
  doubleWidthScale.addEventListener('input', function() {
    runSettingsUpdate(doubleWidthScale, function() {
      var value = prefs.set('doubleWidthScale', doubleWidthScale.value);
      doubleWidthScale.value = String(value);
      doubleWidthScaleValue.textContent = formatDoubleWidthScale(value);
    }, { keepFocus: true });
  });
  doubleWidthScale.addEventListener('change', function() {
    runSettingsUpdate(doubleWidthScale, function() { notify('双页画面比例已更新'); }, { keepFocus: true });
  });

  bindSegment('singleFitSegment', 'singleFit', function(value) { document.getElementById('imageSize').disabled = value !== 'custom'; });
  var imageSize = document.getElementById('imageSize');
  var imageSizeValue = document.getElementById('imageSizeValue');
  imageSize.value = String(prefs.get('imageSize'));
  imageSizeValue.textContent = imageSize.value + 'px';
  imageSize.disabled = prefs.get('singleFit') !== 'custom';
  imageSize.addEventListener('input', function() {
    runSettingsUpdate(imageSize, function() {
      prefs.set('singleFit', 'custom');
      selectSegment('singleFitSegment', 'custom');
      imageSize.disabled = false;
      prefs.set('imageSize', imageSize.value);
      imageSizeValue.textContent = imageSize.value + 'px';
    }, { keepFocus: true });
  });
  imageSize.addEventListener('change', function() {
    runSettingsUpdate(imageSize, function() { notify('图片大小已更新'); }, { keepFocus: true });
  });
  bindBoolean('eyeCare', 'eyeCare', false);
  bindBoolean('headerVisible', 'headerHidden', true);
  bindBoolean('progressVisible', 'progressHidden', true);
  bindBoolean('autoNext', 'autoNext', false);

  var nickname = document.getElementById('chatNickname');
  nickname.value = prefs.get('chatNickname');
  nickname.addEventListener('change', function() {
    runSettingsUpdate(nickname, function() {
      prefs.set('chatNickname', nickname.value.trim());
      notify('默认昵称已更新');
    }, { keepFocus: true });
  });

  var shortcutGrid = document.getElementById('shortcutGrid');
  (window.JMV_READER_SHORTCUTS || []).forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'shortcut-row';
    row.innerHTML = '<span>' + item.keys.map(function(key) { return '<kbd>' + key + '</kbd>'; }).join('<i>或</i>') + '</span><b>' + item.label + '</b>';
    shortcutGrid.appendChild(row);
  });

  function readArrayCount(key) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.length : 0;
    } catch (error) { return 0; }
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
      runSettingsUpdate(button, function() {
        if (type === 'bookmarks') localStorage.removeItem('plugin_jm_bookmarks');
        if (type === 'recent') localStorage.removeItem('jmv-recent');
        if (type === 'progress') prefs.clearPrefix('jmv-progress:');
        refreshCounts();
        notify('本地数据已清理');
      }, { keepFocus: true });
    });
  });

  document.getElementById('resetPreferences').addEventListener('click', function() {
    if (!window.confirm('恢复全部偏好默认值？收藏、最近目录和阅读进度不会被删除。')) return;
    prefs.resetPreferences();
    window.location.reload();
  });
  document.getElementById('replayOnboarding').addEventListener('click', function() {
    try { localStorage.removeItem('jmv-onboarding-settings-v1'); } catch (error) {}
    if (window.showJmvOnboarding) window.showJmvOnboarding(true); else window.location.href = '/';
  });
}

window.initSettingsPage = initSettingsPage;
