(function() {
  document.querySelectorAll('[data-favorite-icon]').forEach(function(element) {
    element.innerHTML = icon(element.dataset.favoriteIcon);
  });
  var dialog = document.getElementById('favoritesExportDialog');
  if (!dialog) return;
  var form = document.getElementById('copyFavoritesForm');
  var input = document.getElementById('copyDestination');
  var button = document.getElementById('copyFavoritesButton');
  var buttonText = document.getElementById('copyFavoritesButtonText');
  var result = document.getElementById('copyFavoritesResult');
  var count = document.getElementById('favoritesExportCount');
  var editButton = document.getElementById('favoritesEditExport');
  function showResult(show) {
    form.classList.toggle('has-result', show);
    result.hidden = !show;
    editButton.hidden = !show;
  }
  editButton.addEventListener('click', function() {
    if (busy) return;
    showResult(false);
    input.focus({preventScroll:true});
  });
  var busy = false;
  var favoriteCount = 0;
  var modes = form.querySelectorAll('[name="exportMode"]');
  function selectedMode() { return form.querySelector('[name="exportMode"]:checked').value; }
  function updateMode() {
    var mode = selectedMode();
    buttonText.textContent = {copy:'复制全部原图',copy_clear:'复制并清空收藏',move:'移动原图并清空收藏'}[mode];
    document.getElementById('favoritesRetentionHint').textContent = mode === 'move' ? '成功后来源原图移入回收站，失败记录保留' : (mode === 'copy_clear' ? '来源文件保留，只清空成功的收藏' : '保留原图和收藏');
  }
  modes.forEach(function(mode) { mode.addEventListener('change', updateMode); });
  var opener = null;
  document.querySelectorAll('[data-open-favorites-export]').forEach(function(trigger) {
    trigger.addEventListener('click', async function() {
      opener = trigger;
      dialog.showModal();
      if (busy) return;
      showResult(false);
      if (currentDirectoryButton) input.value = getCurPath();
      else { try { input.value = localStorage.getItem('jmv-favorites-destination') || input.value; } catch (error) {} }
      button.disabled = true;
      count.textContent = '正在读取收藏数量…';
      try {
        var response = await fetch('/api/favorites', {cache:'no-store'});
        if (!response.ok) throw new Error();
        var data = await response.json();
        favoriteCount = data.images.length;
        count.textContent = '共 ' + data.images.length + ' 张收藏图片，失效原图会自动跳过';
        button.disabled = data.images.length === 0;
      } catch (error) { count.textContent = '无法读取收藏，请关闭后重试'; }
    });
  });
  document.getElementById('closeFavoritesExport').addEventListener('click', function() { dialog.close(); });
  dialog.addEventListener('click', function(event) {
    if (event.target === dialog) {
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', function() { if (opener) opener.focus({preventScroll:true}); });
  var currentDirectoryButton = document.getElementById('useCurrentExportDirectory');
  if (currentDirectoryButton) currentDirectoryButton.addEventListener('click', function() {
    input.value = getCurPath();
    input.focus({preventScroll:true});
  });
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    if (busy || button.disabled) return;
    busy = true;
    editButton.disabled = true;
    var mode = selectedMode();
    var clear = mode !== 'copy';
    modes.forEach(function(mode) { mode.disabled = true; });
    button.disabled = true;
    input.disabled = true;
    if (currentDirectoryButton) currentDirectoryButton.disabled = true;
    buttonText.textContent = '正在复制…';
    showResult(true);
    result.replaceChildren();
    result.textContent = '正在复制原图，请稍候…';
    var destination = input.value.trim();
    try {
      var response = await fetch('/api/favorites/copy', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({destination:destination,mode:mode})
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || '复制失败，请重试');
      result.replaceChildren();
      var title = document.createElement('strong');
      title.textContent = data.clear_error ? '复制完成，收藏未能清空' :
        (data.failed ? '导出完成，部分文件处理失败' : (mode === 'move' ? '移动原图完成' : '复制完成'));
      result.appendChild(title);
      var stats = document.createElement('div');
      stats.className = 'favorites-export-stats';
      [['已复制',data.copied],['跳过',data.skipped],['未完成',data.failed]].forEach(function(item) {
        var cell = document.createElement('span');
        var number = document.createElement('b');
        number.textContent = item[1];
        cell.append(number, document.createTextNode(item[0]));
        stats.appendChild(cell);
      });
      result.appendChild(stats);
      var details = document.createElement('p');
      details.className = 'favorites-export-target';
      details.textContent = '目标：' + destination;
      details.title = details.textContent;
      result.appendChild(details);
      var completedAt = new Date().toLocaleString();
      var time = document.createElement('p');
      time.textContent = '完成时间：' + completedAt;
      result.appendChild(time);
      var actions = document.createElement('div');
      actions.className = 'favorites-export-result-actions';
      if (data.copied) {
        try { localStorage.setItem('jmv-favorites-destination', destination); } catch (error) {}
        var viewTarget = document.createElement('a');
        viewTarget.className = 'btn btn-outline';
        viewTarget.href = '/?path=' + encodeURIComponent(destination);
        viewTarget.textContent = '查看目录';
        actions.appendChild(viewTarget);
      }
      if (clear) {
        var cleared = document.createElement('p');
        cleared.textContent = '已清空 ' + data.cleared + ' 张收藏；' + (mode === 'move' ? '已移动 ' + data.moved + ' 张原图，来源文件在回收站可恢复。' : '来源文件保留。') + '失败或缺失的收藏保留。';
        result.appendChild(cleared);
        if (data.clear_error) {
          var clearError = document.createElement('p');
          clearError.textContent = data.clear_error;
          result.appendChild(clearError);
        }
        favoriteCount = Math.max(0, favoriteCount - data.cleared);
        count.textContent = '剩余 ' + favoriteCount + ' 张收藏图片';
        document.dispatchEvent(new CustomEvent('jmv:favorites-cleared', {detail:{paths:data.cleared_paths}}));
      }
      if (data.renamed) {
        var renamed = document.createElement('p');
        renamed.textContent = data.renamed + ' 张同名图片已自动加序号。';
        result.appendChild(renamed);
      }
      if (data.issues.length) {
        var issue = document.createElement('p');
        issue.className = 'favorites-export-issue';
        result.appendChild(issue);
        var navigation = document.createElement('div');
        navigation.className = 'favorites-export-issue-navigation';
        var previous = document.createElement('button');
        var next = document.createElement('button');
        var page = document.createElement('span');
        previous.type = next.type = 'button';
        previous.className = 'btn btn-outline favorites-export-previous';
        next.className = 'btn btn-outline favorites-export-next';
        previous.innerHTML = next.innerHTML = icon('arrowUp');
        previous.title = '上一条明细'; next.title = '下一条明细';
        previous.setAttribute('aria-label', '上一条明细');
        next.setAttribute('aria-label', '下一条明细');
        var issueIndex = 0;
        function renderIssue() {
          var item = data.issues[issueIndex];
          issue.textContent = item.name + '：' + item.reason;
          issue.title = issue.textContent;
          page.textContent = '明细 ' + (issueIndex + 1) + ' / ' + data.issues.length;
          previous.disabled = issueIndex === 0;
          next.disabled = issueIndex === data.issues.length - 1;
        }
        previous.addEventListener('click', function() { issueIndex--; renderIssue(); });
        next.addEventListener('click', function() { issueIndex++; renderIssue(); });
        navigation.append(previous, page, next);
        if (data.issues.length > 1) result.appendChild(navigation);
        renderIssue();
      }
      var download = document.createElement('button');
      download.type = 'button';
      download.className = 'btn btn-outline';
      download.textContent = '下载明细';
      download.addEventListener('click', function() {
        var report = Object.assign({destination:destination, completed_at:completedAt, mode:mode}, data);
        var url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:'application/json'}));
        var link = document.createElement('a');
        link.href = url; link.download = 'favorites-export.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      });
      actions.appendChild(download);
      result.appendChild(actions);
    } catch (error) { result.textContent = error.message || '复制失败，请重试'; }
    finally {
      busy = false;
      editButton.disabled = false;
      button.disabled = favoriteCount === 0;
      input.disabled = false;
      if (currentDirectoryButton) currentDirectoryButton.disabled = false;
      modes.forEach(function(mode) { mode.disabled = false; });
      updateMode();
    }
  });
})();
