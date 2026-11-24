(function () {
  'use strict';
  var labels = { bookmarks: '收藏目录', progress: '阅读进度', sequence: '排序与插页', readerMode: '阅读方式', readingDirection: '阅读方向', doubleWidthScale: '双页比例', eyeCare: '护眼', headerHidden: '顶部栏', progressHidden: '进度条', autoNext: '自动连播' };
  var descriptions = { bookmarks: '收藏的目录和添加时间', progress: '接着上次的位置继续阅读', sequence: '记住的调序与空白插页', readerMode: '下拉、单页或双页', readingDirection: '双页从左向右或从右向左', doubleWidthScale: '双页画布的宽度百分比', eyeCare: '护眼滤镜的开关', headerHidden: '阅读页顶部栏是否显示', progressHidden: '底部阅读进度是否显示', autoNext: '是否自动连播下一本' };
  var icons = { bookmarks: 'folderBookmark', progress: 'book', sequence: 'insertPage', readerMode: 'doublePage', readingDirection: 'arrowLeft', doubleWidthScale: 'slider', eyeCare: 'eyecare', headerHidden: 'panelTop', progressHidden: 'panelBottom', autoNext: 'autoNext' };
  var host = document.getElementById('syncSettings');
  if (!host || !window.JmvSync) return;
  var participant = document.getElementById('syncParticipation');
  var policy = document.getElementById('syncPolicy');
  var serverToggle = document.getElementById('syncServerEnabled');
  var ranges = document.getElementById('syncRanges');
  var saveButton = document.getElementById('syncSavePolicy');
  var saveMarkup = saveButton.innerHTML;
  var policyDirty = false;
  var policySaving = false;
  var policyError = '';
  function computePolicyDirty() {
    var state = window.JmvSync.getStatus();
    if (!state || !state.config) return false;
    var enabledNow = serverToggle.getAttribute('aria-checked') === 'true';
    if (enabledNow !== Boolean(state.config.enabled)) return true;
    var dirty = false;
    ranges.querySelectorAll('input').forEach(function(input) {
      if (input.checked !== (state.config.scopes[input.dataset.scope] === true)) dirty = true;
    });
    return dirty;
  }
  ranges.addEventListener('change', function(event) {
    update(event.target, function() { policyDirty = computePolicyDirty(); policyError = ''; renderDraft(); });
  });
  [{ title: '阅读记忆', scopes: ['bookmarks', 'progress', 'sequence'] },
    { title: '阅读偏好', scopes: ['readerMode', 'readingDirection', 'doubleWidthScale', 'eyeCare', 'headerHidden', 'progressHidden', 'autoNext'] }].forEach(function(group) {
    var section = document.createElement('div'); section.className = 'sync-range-group';
    var heading = document.createElement('div'); heading.className = 'sync-group-heading';
    var title = document.createElement('h4'); title.textContent = group.title;
    heading.append(title);
    var options = document.createElement('div'); options.className = 'sync-range-options';
    group.scopes.forEach(function(name) {
      var label = document.createElement('label'); label.className = 'sync-range';
      var image = document.createElement('span'); image.className = 'settings-icon sync-range-icon'; image.setAttribute('aria-hidden', 'true'); image.innerHTML = icon(icons[name]);
      var content = document.createElement('span'); content.className = 'sync-range-content';
      var text = document.createElement('b'); text.textContent = labels[name];
      label.title = descriptions[name]; content.append(text);
      var input = document.createElement('input'); input.type = 'checkbox'; input.dataset.scope = name;
      label.append(image, content, input); options.appendChild(label);
    });
    section.append(heading, options); ranges.appendChild(section);
  });
  function update(target, fn, keepFocus) {
    if (window.runSettingsUpdate) window.runSettingsUpdate(target, fn, { keepFocus: keepFocus !== false && Boolean(target) });
    else fn();
  }
  function renderDraft() {
    var count = 0;
    ranges.querySelectorAll('input').forEach(function(input) {
      input.closest('.sync-range').classList.toggle('is-selected', input.checked);
      input.disabled = policySaving;
      if (input.checked) count++;
    });
    serverToggle.disabled = policySaving;
    policy.classList.toggle('is-saving', policySaving);
    var footer = saveButton.closest ? saveButton.closest('.sync-policy-footer') : null;
    if (footer && footer.classList) footer.classList.toggle('is-dirty', policyDirty && !policySaving);
    document.getElementById('syncRangeCount').textContent = '已选择 ' + count + ' 项';
    document.getElementById('syncPolicyHint').textContent = policyError || (policyDirty ? '有未保存的修改' : '保存后对所有设备生效。');
    document.getElementById('syncPolicyHint').classList.toggle('is-error', Boolean(policyError));
    saveButton.disabled = !policyDirty || policySaving;
    saveButton.setAttribute('aria-busy', String(policySaving));
    if (policySaving) saveButton.textContent = '正在保存…';
    else saveButton.innerHTML = saveMarkup;
  }
  function render() {
    var state = window.JmvSync.getStatus();
    // 后台状态轮询不抢占用户当前焦点，也不强拉锚点
    update(null, function() {
      participant.setAttribute('aria-checked', String(state.participating));
      document.getElementById('syncDeviceBadge').textContent = state.participating ? '已参与' : '未参与';
      document.getElementById('syncDeviceBadge').classList.toggle('is-active', state.participating);
      host.dataset.status = state.status === '已同步' ? 'success' : (/失败|不足/.test(state.status) ? 'warning' : (/正在|连接|同步中/.test(state.status) ? 'syncing' : 'idle'));
      document.getElementById('syncStatus').textContent = state.status;
      policy.hidden = !state.config.editable;
      host.dataset.policyEditable = String(Boolean(state.config.editable));
      document.getElementById('syncRemote').hidden = Boolean(state.config.editable);
      if (!policyDirty) {
        serverToggle.setAttribute('aria-checked', String(Boolean(state.config.enabled)));
        ranges.querySelectorAll('input').forEach(function(input) { input.checked = state.config.scopes[input.dataset.scope] === true; });
      }
      var active = Object.keys(labels).filter(function(name) { return state.config.scopes[name]; }).map(function(name) { return labels[name]; });
      var summary = document.getElementById('syncActiveRanges');
      summary.textContent = (state.config.enabled ? '同步范围：' : '服务器已关闭；范围：') + (active.slice(0, 3).join('、') || '未选择范围') + (active.length > 3 ? '等 ' + active.length + ' 项' : '');
      summary.setAttribute('title', active.join('、'));
      document.getElementById('syncMergeBookmarks').disabled = !window.JmvSync.allows('bookmarks');
      renderDraft();
    }, false);
  }
  function confirmation(message, onAccept) {
    var opener = document.activeElement;
    var dialog = document.createElement('dialog'); dialog.className = 'sync-confirm';
    var text = document.createElement('p'); text.textContent = message;
    var accept = document.createElement('button'); accept.type = 'button'; accept.className = 'btn btn-primary'; accept.textContent = '确认';
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-outline'; cancel.textContent = '取消';
    var actions = document.createElement('div'); actions.className = 'sync-actions'; actions.append(cancel, accept);
    dialog.append(text, actions); document.body.appendChild(dialog);
    dialog.addEventListener('close', function() {
      dialog.remove();
      if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', function(event) {
      if (event.target === dialog) {
        var rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
    cancel.onclick = function() { dialog.close(); };
    accept.onclick = function() { dialog.close(); onAccept(); };
    dialog.showModal();
  }
  participant.onclick = function() {
    var state = window.JmvSync.getStatus();
    if (state.participating) { window.JmvSync.setEnabled(false); return; }
    confirmation('开启后采用服务器允许范围内的共享记忆。服务器已有资料时使用服务器资料；本机收藏目录不会自动合并。服务器为空时，可从服务器电脑本机建立共享起点。', async function() {
      var initialBookmarks = [];
      try { initialBookmarks = JSON.parse(localStorage.getItem('plugin_jm_bookmarks') || '[]'); } catch (error) {}
      await window.JmvSync.setEnabled(true, false);
      if (state.config.editable && window.JmvSync.isEnabled()) {
        var hasShared = Object.keys(window.JmvSync.getStatus().entries).some(function(key) { return window.JmvSync.getStatus().entries[key].value !== null; });
        if (!hasShared) confirmation('要将本机收藏目录、阅读记忆和允许同步的阅读设置加入服务器吗？已有共享记录不会被覆盖。', function() {
          window.JmvSync.mergeBookmarks(initialBookmarks);
          Object.keys(labels).forEach(function(name) { if (window.JmvPrefs.definitions[name] && window.JmvSync.getRecord('preference:' + name) === undefined) window.JmvSync.setRecord('preference:' + name, window.JmvPrefs.get(name)); });
          window.dispatchEvent(new CustomEvent('jmv:sync-initialize', { detail: { scopes: state.config.scopes } }));
        });
      }
    });
  };
  serverToggle.onclick = function() { update(serverToggle, function() { serverToggle.setAttribute('aria-checked', String(serverToggle.getAttribute('aria-checked') !== 'true')); policyDirty = computePolicyDirty(); policyError = ''; renderDraft(); }); };
  saveButton.onclick = async function() {
    if (policySaving || !policyDirty) return;
    policySaving = true; policyError = ''; update(saveButton, renderDraft);
    var scopes = {}; ranges.querySelectorAll('input').forEach(function(input) { scopes[input.dataset.scope] = input.checked; });
    try { await window.JmvSync.saveConfig({ enabled: serverToggle.getAttribute('aria-checked') === 'true', scopes: scopes }); policyDirty = false; render(); if (window.toast) window.toast('同步设置已保存', 'success'); }
    catch (error) { policyError = error.conflict ? '配置已被其他窗口修改，请检查后重新保存' : '保存失败，修改已保留，请重试'; update(saveButton, renderDraft); await window.JmvSync.refresh(); }
    finally { policySaving = false; update(saveButton, renderDraft); }
  };
  document.getElementById('syncRetry').onclick = function() { window.JmvSync.retry(); };
  document.getElementById('syncMergeBookmarks').onclick = function() {
    confirmation('将当前浏览器的收藏目录加入共享收藏；不会覆盖已有记录。', function() { window.JmvSync.mergeBookmarks(); });
  };
  window.addEventListener('beforeunload', function(event) {
    if (policyDirty) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('jmv:sync-status', render);
  window.JmvSync.ready.then(render);
})();
