function initSettingsPage() {
  var prefs = window.JmvPrefs;
  if (!prefs) return;

  document.getElementById('settingsHeroIcon').innerHTML = icon('settings');
  document.querySelectorAll('[data-settings-icon]').forEach(function (element) {
    element.innerHTML = icon(element.getAttribute('data-settings-icon'));
  });

  var scrollHost = document.querySelector('.settings-content');
  var settingsMain = document.querySelector('.settings-main');
  var settingsRailLinks = document.querySelectorAll('.settings-rail a[href^="#"]');
  var interactionSnapshots = new WeakMap();
  var activeTransaction = null;

  function resetSettingsDocumentScroll() {
    var scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement.scrollTop !== 0) scrollingElement.scrollTop = 0;
    if (scrollingElement.scrollLeft !== 0) scrollingElement.scrollLeft = 0;
  }

  function stabilizeSettingsDocumentScroll() {
    resetSettingsDocumentScroll();
    window.requestAnimationFrame(function() {
      resetSettingsDocumentScroll();
      window.requestAnimationFrame(resetSettingsDocumentScroll);
    });
    window.setTimeout(resetSettingsDocumentScroll, 0);
    window.setTimeout(resetSettingsDocumentScroll, 120);
  }

  function settingsSectionFromHash(hash) {
    if (!hash || hash === '#') return null;
    var id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch (error) {}
    return document.getElementById(id);
  }

  function updateSettingsRailState(section) {
    settingsRailLinks.forEach(function(link) {
      var active = section && link.getAttribute('href') === '#' + section.id;
      link.classList.toggle('active', Boolean(active));
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function scrollToSettingsSection(section, updateHistory) {
    if (!scrollHost || !section || !scrollHost.contains(section)) {
      stabilizeSettingsDocumentScroll();
      return;
    }
    cancelActiveTransaction();
    var hostRect = scrollHost.getBoundingClientRect();
    var sectionRect = section.getBoundingClientRect();
    var maxScroll = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
    var targetTop = scrollHost.scrollTop + sectionRect.top - hostRect.top;
    scrollHost.scrollTop = Math.max(0, Math.min(targetTop, maxScroll));
    updateSettingsRailState(section);
    section.classList.add('is-nav-target');
    window.setTimeout(function() { section.classList.remove('is-nav-target'); }, 520);
    if (updateHistory) {
      var nextHash = '#' + encodeURIComponent(section.id);
      if (window.location.hash !== nextHash) {
        window.history.pushState({ settingsSection: section.id }, '', nextHash);
      }
    }
    stabilizeSettingsDocumentScroll();
  }

  function restoreSettingsHashPosition() {
    var section = settingsSectionFromHash(window.location.hash);
    if (section) scrollToSettingsSection(section, false);
    else {
      updateSettingsRailState(null);
      stabilizeSettingsDocumentScroll();
    }
  }

  settingsRailLinks.forEach(function(link) {
    link.addEventListener('click', function(event) {
      var section = settingsSectionFromHash(link.getAttribute('href'));
      if (!section) return;
      event.preventDefault();
      scrollToSettingsSection(section, true);
    });
  });
  window.addEventListener('scroll', resetSettingsDocumentScroll, { passive: true });
  window.addEventListener('hashchange', restoreSettingsHashPosition);
  window.addEventListener('popstate', restoreSettingsHashPosition);
  var settingsResizeTimer = null;
  window.addEventListener('resize', function() {
    stabilizeSettingsDocumentScroll();
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(restoreSettingsHashPosition);
    });
    if (settingsResizeTimer !== null) window.clearTimeout(settingsResizeTimer);
    settingsResizeTimer = window.setTimeout(restoreSettingsHashPosition, 180);
  });
  window.addEventListener('pageshow', function() {
    window.requestAnimationFrame(restoreSettingsHashPosition);
  });
  window.requestAnimationFrame(function() {
    window.requestAnimationFrame(restoreSettingsHashPosition);
  });

  // 滚动跟随高亮左侧分类导航（按容器像素高度计算观察带，避免宽矮屏百分比压缩；维护当前可见节集合）
  if (scrollHost && 'IntersectionObserver' in window) {
    var spySections = Array.from(scrollHost.querySelectorAll('.settings-section[id]'));
    var visibleSections = new Set();
    var railSpy = null;
    function setupRailSpy() {
      if (railSpy) railSpy.disconnect();
      visibleSections.clear();
      var h = Math.max(240, scrollHost.clientHeight || 600);
      var topPx = Math.round(h * 0.12);
      var bottomPx = Math.round(h * 0.58);
      railSpy = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) visibleSections.add(entry.target);
          else visibleSections.delete(entry.target);
        });
        if (!visibleSections.size) return;
        var ordered = Array.from(visibleSections).sort(function(a, b) {
          return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });
        updateSettingsRailState(ordered[0]);
      }, { root: scrollHost, rootMargin: '-' + topPx + 'px 0px -' + bottomPx + 'px 0px', threshold: 0 });
      spySections.forEach(function(section) { railSpy.observe(section); });
    }
    setupRailSpy();
    window.addEventListener('resize', setupRailSpy);
  }

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
      if (button.closest('.settings-segment') !== document.getElementById(id)) return;
      button.classList.toggle('active', button.dataset.value === value);
    });
  }

  function bindSegment(id, prefName, callback) {
    var group = document.getElementById(id);
    selectSegment(id, prefs.get(prefName));
    group.addEventListener('click', function(event) {
      var button = event.target.closest('[data-value]');
      if (!button || button.closest('.settings-segment') !== group) return;
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
    var button = document.getElementById(id);
    function render(value) { button.setAttribute('aria-checked', value ? 'true' : 'false'); }
    render(invert ? !prefs.get(prefName) : !!prefs.get(prefName));
    button.addEventListener('click', function() {
      runSettingsUpdate(button, function() {
        var value = button.getAttribute('aria-checked') !== 'true';
        render(value);
        prefs.set(prefName, invert ? !value : value);
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
    window.addEventListener('jmv:preference-change', function(event) {
      if (event.detail && event.detail.name === prefName) render(!!event.detail.value);
    });
    window.addEventListener('storage', function(event) {
      var definition = prefs.definitions[prefName];
      if (definition && event.key === definition.key) {
        render(event.newValue == null ? !!definition.fallback : (event.newValue === '1' || event.newValue === 'true'));
      }
    });
  }

  var themeSelect = document.getElementById('themeSelect');
  themeSelect.value = prefs.get('theme') || 'system';
  themeSelect.addEventListener('change', function() {
    runSettingsUpdate(themeSelect, function() {
      var value = themeSelect.value;
      if (value === 'system') prefs.remove('theme'); else prefs.set('theme', value);
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var resolved = value === 'system' ? (prefersDark ? 'dark' : 'light') : value;
      document.documentElement.setAttribute('data-theme', resolved);
      if (window.syncThemeToggleControls) window.syncThemeToggleControls(resolved);
      notify('颜色模式已更新');
    }, { keepFocus: true });
  });
  window.addEventListener('jmv:preference-change', function(event) {
    if (event.detail && event.detail.name === 'theme') {
      themeSelect.value = prefs.get('theme') || 'system';
    }
  });
  window.addEventListener('storage', function(event) {
    if (event.key === 'jmv-theme') {
      themeSelect.value = prefs.get('theme') || 'system';
    }
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

  var backgroundClear = document.getElementById('backgroundClear');
  var backgroundFile = document.getElementById('backgroundFile');
  var backgroundFileLabel = backgroundFile ? backgroundFile.closest('label') : null;
  function syncBackgroundControls() {
    var hasBg = Boolean(prefs.get('background'));
    if (backgroundClear) backgroundClear.disabled = !hasBg;
    if (opacity) opacity.disabled = !hasBg;
  }
  syncBackgroundControls();

  backgroundFile.addEventListener('change', function() {
    var file = backgroundFile.files && backgroundFile.files[0];
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) {
      notify('请选择图片文件', 'error');
      backgroundFile.value = '';
      return;
    }
    runSettingsUpdate(backgroundFile, function() {
      var form = new FormData();
      form.append('file', file);
      backgroundFile.value = '';
      if (backgroundFileLabel) backgroundFileLabel.classList.add('is-busy');
      return fetch('/api/upload_bg', { method: 'POST', body: form }).then(function(response) {
        if (!response.ok) throw new Error('upload failed');
        return response.json();
      }).then(function() {
        var url = '/api/background?t=' + Date.now();
        prefs.set('background', url);
        applyBgImage(url);
        applyBgOpacity(opacity.value);
        syncBackgroundControls();
        notify('背景图片已更新');
      }).catch(function() { notify('背景图片上传失败', 'error'); })
        .finally(function() { if (backgroundFileLabel) backgroundFileLabel.classList.remove('is-busy'); });
    }, { keepFocus: true });
  });

  backgroundClear.addEventListener('click', function() {
    runSettingsUpdate(backgroundClear, function() {
      backgroundClear.disabled = true;
      return fetch('/api/background/clear', { method: 'POST' }).then(function(response) {
        if (!response.ok) throw new Error('clear failed');
        prefs.remove('background');
        applyBgImage('');
        syncBackgroundControls();
        notify('背景图片已清除');
      }).catch(function() {
        syncBackgroundControls();
        notify('背景图片清除失败', 'error');
      });
    }, { keepFocus: true });
  });

  bindSegment('browserViewSegment', 'browserView');
  bindDeferredSwitch('sidebarCollapsed', 'sidebarCollapsed', '已保存，刷新页面后生效');
  bindDeferredSwitch('browserOperations', 'browserOperations', '分栏操作入口设置已即时生效');
  bindDeferredSwitch('confirmRecycle', 'confirmRecycle', '回收站确认设置已即时生效');
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

  function renderReaderMode() {
    var mode = prefs.get('readerMode');
    selectSegment('readerModeSegment', mode);
    document.querySelectorAll('[data-reader-panel]').forEach(function(panel) {
      panel.hidden = panel.getAttribute('data-reader-panel') !== mode;
    });
    document.getElementById('readerOptionsTitle').textContent = { scroll: '下拉阅读设置', single: '单页阅读设置', double: '双页阅读设置' }[mode];
  }
  bindSegment('readerModeSegment', 'readerMode', renderReaderMode);
  renderReaderMode();
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

  var imageSizeControls = [
    { input: document.getElementById('imageSize'), output: document.getElementById('imageSizeValue'), width: 'imageSize', fit: 'singleFit', custom: 'custom' },
    { input: document.getElementById('scrollImageSize'), output: document.getElementById('scrollImageSizeValue'), width: 'scrollImageSize', fit: 'scrollFit', custom: 'custom' }
  ];
  function renderImageSizing() {
    selectSegment('singleFitSegment', prefs.get('singleFit'));
    selectSegment('scrollFitSegment', prefs.get('scrollFit'));
    imageSizeControls.forEach(function(control) {
      control.input.value = String(prefs.get(control.width));
      control.output.textContent = control.input.value + 'px';
      control.input.disabled = prefs.get(control.fit) !== control.custom;
    });
  }
  bindSegment('singleFitSegment', 'singleFit', renderImageSizing);
  bindSegment('scrollFitSegment', 'scrollFit', renderImageSizing);
  renderImageSizing();
  imageSizeControls.forEach(function(control) {
    control.input.addEventListener('input', function() {
      var width = control.input.value;
      runSettingsUpdate(control.input, function() {
        prefs.set(control.width, width);
        renderImageSizing();
      }, { keepFocus: true });
    });
    control.input.addEventListener('change', function() {
      runSettingsUpdate(control.input, function() { notify('图片宽度已更新'); }, { keepFocus: true });
    });
  });
  window.addEventListener('jmv:preference-change', function(event) {
    if (!event.detail) return;
    if (event.detail.name === 'readerMode') renderReaderMode();
    if (['imageSize', 'singleFit', 'scrollImageSize', 'scrollFit'].indexOf(event.detail.name) !== -1) renderImageSizing();
  });
  window.addEventListener('storage', function(event) {
    if (event.key === null || event.key === prefs.definitions.readerMode.key) renderReaderMode();
    if (event.key === null || ['imageSize', 'singleFit', 'scrollImageSize', 'scrollFit'].some(function(name) { return prefs.definitions[name].key === event.key; })) renderImageSizing();
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

  function setCountValue(id, value, animate) {
    var el = document.getElementById(id);
    if (!el) return;
    var next = String(value);
    var changed = el.textContent !== next;
    el.textContent = next;
    if (animate && changed) {
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
      window.setTimeout(function() { el.classList.remove('is-bumped'); }, 220);
    }
  }

  function countProgressRecords() {
    var seen = new Set();
    var canon = function(p) {
      return (window.JmvSync && window.JmvSync.canonicalPath) ? window.JmvSync.canonicalPath(p) : String(p || '');
    };
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i) || '';
        if (key.indexOf('jmv-progress:') === 0) seen.add(canon(key.slice('jmv-progress:'.length)));
        else if (key.indexOf('jmv-sync-progress:') === 0) seen.add(canon(key.slice('jmv-sync-progress:'.length)));
      }
    } catch (e) {}
    if (window.JmvSync && window.JmvSync.allows('progress')) {
      var status = window.JmvSync.getStatus();
      var entries = (status && status.entries) || {};
      Object.keys(entries).forEach(function(key) {
        if (key.indexOf('progress:') === 0 && entries[key] && entries[key].value !== null) {
          seen.add(canon(key.slice('progress:'.length)));
        }
      });
    }
    return seen.size;
  }

  function refreshCounts(animate) {
    var counts = {
      bookmarks: readArrayCount('plugin_jm_bookmarks'),
      recent: readArrayCount('jmv-recent'),
      progress: countProgressRecords()
    };
    setCountValue('bookmarkCount', counts.bookmarks, animate);
    setCountValue('recentCount', counts.recent, animate);
    setCountValue('progressCount', counts.progress, animate);
    document.querySelectorAll('[data-clear]').forEach(function(button) {
      button.disabled = counts[button.dataset.clear] === 0;
    });
  }
  refreshCounts(false);
  window.addEventListener('jmv:sync-applied', function() { runSettingsUpdate(null, function() { refreshCounts(true); }, { keepFocus: false }); });
  window.addEventListener('jmv:sync-status', function() { refreshCounts(false); });
  window.addEventListener('storage', function() { refreshCounts(false); });
  document.querySelectorAll('[data-clear]').forEach(function(button) {
    button.addEventListener('click', function() {
      var type = button.dataset.clear;
      var labels = { bookmarks: '全部收藏目录', recent: '全部最近访问记录', progress: '全部漫画阅读进度' };
      var shared = window.JmvSync && window.JmvSync.allows(type);
      var confirmPromise = window.JmvModal
        ? JmvModal.confirm({
            title: '清除' + labels[type] + '？',
            description: '此操作会立即清理记录，且无法撤销。',
            warning: shared ? '当前范围正在参与跨设备同步，确认后也会同步清除服务器上的共享记录。' : '',
            confirmText: '确认清除',
            icon: 'trash',
            danger: true
          })
        : Promise.resolve(window.confirm('确定清除' + labels[type] + '？此操作无法撤销。'));
      confirmPromise.then(function(ok) {
        if (!ok) return;
        runSettingsUpdate(button, function() {
          if (shared) window.JmvSync.clearScope(type);
          if (type === 'bookmarks') localStorage.removeItem('plugin_jm_bookmarks');
          if (type === 'recent') localStorage.removeItem('jmv-recent');
          if (type === 'progress') {
            prefs.clearPrefix('jmv-progress:');
            prefs.clearPrefix('jmv-sync-progress:');
          }
          refreshCounts(true);
          notify(shared ? '本机记录已清理，共享修改正在同步' : '本地数据已清理');
        }, { keepFocus: true });
      });
    });
  });

  document.getElementById('resetPreferences').addEventListener('click', function() {
    var confirmPromise = window.JmvModal
      ? JmvModal.confirm({
          title: '恢复全部偏好默认值？',
          description: '外观、文件浏览、阅读模式和图片大小将恢复为初始默认设置；收藏目录、最近目录和阅读进度不会被删除。',
          confirmText: '恢复默认',
          icon: 'reset',
          danger: true
        })
      : Promise.resolve(window.confirm('恢复全部偏好默认值？收藏、最近目录和阅读进度不会被删除。'));
    confirmPromise.then(function(ok) {
      if (!ok) return;
      prefs.resetPreferences();
      notify('已恢复默认偏好，正在刷新…');
      window.setTimeout(function() { window.location.reload(); }, 280);
    });
  });
  document.getElementById('replayOnboarding').addEventListener('click', function() {
    try { localStorage.removeItem('jmv-onboarding-settings-v1'); } catch (error) {}
    if (window.showJmvOnboarding) window.showJmvOnboarding(true); else window.location.href = '/';
  });
}

window.initSettingsPage = initSettingsPage;
