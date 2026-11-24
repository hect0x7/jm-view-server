var selectedUploadFiles = [];
var activeUploadXhr = null;
var activeBatchKeys = null;
var uploadAwaitingServer = false;
var lastFailedBatchFiles = [];

function formatFileSize(size) {
  if (size >= 1024 * 1024 * 1024) return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (size >= 1024 * 1024) return (Math.round(size * 100 / (1024 * 1024)) / 100) + ' MB';
  if (size >= 1024) return (Math.round(size * 100 / 1024) / 100) + ' KB';
  return size + ' B';
}

function fileKey(file) {
  return [file.name, file.size, file.lastModified].join('::');
}

function setProgressVisual(percent, statusClass) {
  var fill = document.getElementById('progressFill');
  var track = document.getElementById('progressTrack');
  var clamped = Math.max(0, Math.min(100, percent));
  if (fill) fill.style.transform = 'scaleX(' + (clamped / 100) + ')';
  if (track) {
    track.classList.toggle('is-saving', statusClass === 'saving');
    track.classList.toggle('is-error', statusClass === 'error');
    track.classList.toggle('is-success', statusClass === 'success');
  }
}

function setUploadingState(uploading, awaitingServer) {
  var submitBtn = document.getElementById('submit');
  var cancelBtn = document.getElementById('cancelUploadBtn');
  var clearBtn = document.getElementById('clearQueueBtn');
  var dz = document.getElementById('dropzone');
  uploadAwaitingServer = !!(uploading && awaitingServer);
  if (submitBtn) submitBtn.disabled = uploading || selectedUploadFiles.length === 0;
  if (cancelBtn) {
    cancelBtn.hidden = !uploading;
    cancelBtn.disabled = uploadAwaitingServer;
    cancelBtn.textContent = uploadAwaitingServer ? '服务器保存中…' : '取消上传';
  }
  if (clearBtn) clearBtn.disabled = uploading;
  if (dz) dz.classList.toggle('is-disabled', uploading);
  document.querySelectorAll('.upload-queue-remove').forEach(function(btn) {
    btn.disabled = uploading;
  });
}

function renderUploadQueue(focusAfterRemoveIdx) {
  var fileNameTip = document.getElementById('fileName');
  var fileSizeEl = document.getElementById('fileSize');
  var fileTypeEl = document.getElementById('fileType');
  var clearBtn = document.getElementById('clearQueueBtn');
  var queueHost = document.getElementById('uploadQueue');
  var summaryRow = document.getElementById('uploadSummaryRow');
  var resultBox = document.getElementById('result');
  var dz = document.getElementById('dropzone');
  var submitBtn = document.getElementById('submit');
  var submitLabel = document.getElementById('submitLabel');

  var totalSize = selectedUploadFiles.reduce(function(sum, f) { return sum + f.size; }, 0);
  var count = selectedUploadFiles.length;
  var showingSuccessResult = !!(resultBox && resultBox.style.display === 'block' && !resultBox.classList.contains('is-error'));

  if (fileNameTip) fileNameTip.classList.toggle('has-files', count > 0);
  if (clearBtn) clearBtn.hidden = count === 0;
  if (submitBtn) submitBtn.disabled = !!activeUploadXhr || count === 0;
  if (summaryRow) summaryRow.hidden = count === 0 && showingSuccessResult;
  if (dz) dz.classList.toggle('is-compact', showingSuccessResult && count === 0);

  if (!count) {
    if (fileNameTip) fileNameTip.textContent = '尚未选择文件';
    if (fileSizeEl) fileSizeEl.textContent = '';
    if (fileTypeEl) fileTypeEl.textContent = '';
    if (submitLabel) submitLabel.textContent = '选择文件后上传';
    if (queueHost) { queueHost.replaceChildren(); queueHost.hidden = true; }
    if (typeof focusAfterRemoveIdx === 'number') {
      var dz = document.getElementById('dropzone');
      if (dz && dz.focus) dz.focus({ preventScroll: true });
    }
    return;
  }

  if (fileNameTip) {
    fileNameTip.textContent = count === 1 ? '已选: ' + selectedUploadFiles[0].name : '已选择 ' + count + ' 个文件';
  }
  if (fileSizeEl) fileSizeEl.textContent = '总大小: ' + formatFileSize(totalSize);
  if (fileTypeEl) fileTypeEl.textContent = count === 1 && selectedUploadFiles[0].type ? '类型: ' + selectedUploadFiles[0].type : '';
  if (submitLabel) submitLabel.textContent = count === 1 ? '上传 1 个文件' : '上传 ' + count + ' 个文件';

  if (queueHost) {
    var existingRows = new Map();
    Array.from(queueHost.querySelectorAll('.upload-queue-item')).forEach(function(row) {
      if (row.dataset.fileKey) existingRows.set(row.dataset.fileKey, row);
    });
    var nextKeys = new Set(selectedUploadFiles.map(fileKey));
    existingRows.forEach(function(row, key) {
      if (!nextKeys.has(key)) row.remove();
    });

    selectedUploadFiles.forEach(function(file, idx) {
      var key = fileKey(file);
      var row = existingRows.get(key);
      if (!row) {
        row = document.createElement('div');
        row.className = 'upload-queue-item is-entering';
        row.dataset.fileKey = key;
        row.addEventListener('animationend', function() { row.classList.remove('is-entering'); }, { once: true });
        var nameEl = document.createElement('span');
        nameEl.className = 'upload-queue-name';
        nameEl.textContent = file.name;
        nameEl.title = file.name;
        var sizeEl = document.createElement('span');
        sizeEl.className = 'upload-queue-size';
        sizeEl.textContent = formatFileSize(file.size);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'upload-queue-remove';
        removeBtn.title = '移除此文件';
        removeBtn.setAttribute('aria-label', '移除 ' + file.name);
        removeBtn.innerHTML = typeof icon === 'function' ? icon('x') : '×';
        removeBtn.addEventListener('click', function() {
          if (activeUploadXhr) return;
          var removeIdx = selectedUploadFiles.findIndex(function(item) { return fileKey(item) === key; });
          if (removeIdx === -1) return;
          selectedUploadFiles.splice(removeIdx, 1);
          renderUploadQueue(removeIdx);
        });
        row.append(nameEl, sizeEl, removeBtn);
      }
      var btn = row.querySelector('.upload-queue-remove');
      if (btn) btn.disabled = !!activeUploadXhr;
      if (queueHost.children[idx] !== row) {
        queueHost.insertBefore(row, queueHost.children[idx] || null);
      }
    });
    queueHost.hidden = false;

    if (typeof focusAfterRemoveIdx === 'number') {
      var buttons = queueHost.querySelectorAll('.upload-queue-remove');
      var targetBtn = buttons[Math.min(focusAfterRemoveIdx, buttons.length - 1)];
      if (targetBtn && targetBtn.focus) targetBtn.focus({ preventScroll: true });
    }
  }
}

function addFilesToUploadQueue(fileList) {
  if (!fileList || !fileList.length) return;
  var existing = new Set(selectedUploadFiles.map(fileKey));
  var added = 0;
  Array.prototype.forEach.call(fileList, function(file) {
    var k = fileKey(file);
    if (!existing.has(k)) {
      selectedUploadFiles.push(file);
      existing.add(k);
      added++;
    }
  });
  if (added === 0 && fileList.length > 0 && window.toast) {
    toast('所选文件已在待上传队列中', 'default');
  }
  setProgressVisual(0, '');
  var pv = document.getElementById('progress-value');
  if (pv) pv.textContent = '0%';
  renderUploadQueue();
}
window.addFilesToUploadQueue = addFilesToUploadQueue;

function clearUploadQueue() {
  if (activeUploadXhr) return;
  selectedUploadFiles = [];
  lastFailedBatchFiles = [];
  var input = document.getElementById('file');
  if (input) input.value = '';
  var result = document.getElementById('result');
  var resultActions = document.getElementById('resultActions');
  if (result) { result.style.display = 'none'; result.classList.remove('is-error'); }
  if (resultActions) resultActions.hidden = true;
  setProgressVisual(0, '');
  var pv = document.getElementById('progress-value');
  if (pv) pv.textContent = '0%';
  renderUploadQueue();
}
window.clearUploadQueue = clearUploadQueue;

function updateSelectedFiles() {
  var input = document.getElementById('file');
  if (!input || !input.files || !input.files.length) return;
  addFilesToUploadQueue(input.files);
  input.value = '';
}

function uploadFile() {
  if (activeUploadXhr) return;
  var result = document.getElementById('result');
  var resultActions = document.getElementById('resultActions');
  var retryBtn = document.getElementById('retryUploadBtn');
  var continueBtn = document.getElementById('continueUploadBtn');

  if (!selectedUploadFiles.length && lastFailedBatchFiles.length) {
    selectedUploadFiles = lastFailedBatchFiles.slice();
    renderUploadQueue();
  }
  if (!selectedUploadFiles.length) {
    toast('请先选择需要上传的文件', 'error');
    return;
  }

  var batchFiles = selectedUploadFiles.slice();
  activeBatchKeys = new Set(batchFiles.map(fileKey));
  lastFailedBatchFiles = batchFiles;

  var fd = new FormData();
  batchFiles.forEach(function(file) {
    fd.append('file', file);
  });
  var uploadTarget = document.getElementById('uploadTarget');
  if (uploadTarget) fd.append('path', uploadTarget.textContent.trim());

  if (result) {
    result.style.display = 'none';
    result.classList.remove('is-error');
    result.textContent = '';
  }
  if (resultActions) resultActions.hidden = true;
  if (retryBtn) retryBtn.hidden = true;
  if (continueBtn) continueBtn.hidden = true;

  setProgressVisual(0, '');
  document.getElementById('progress-value').textContent = '准备上传…';

  var xhr = new XMLHttpRequest();
  activeUploadXhr = xhr;
  setUploadingState(true, false);

  xhr.upload.addEventListener('progress', uploadProgress, false);
  xhr.upload.addEventListener('load', function() {
    if (activeUploadXhr !== xhr) return;
    document.getElementById('progress-value').textContent = '已发送完毕，正在写入服务器…';
    setProgressVisual(100, 'saving');
    setUploadingState(true, true);
  }, false);
  xhr.addEventListener('load', uploadComplete, false);
  xhr.addEventListener('error', uploadFailed, false);
  xhr.addEventListener('abort', uploadCanceled, false);
  xhr.open('POST', '/upload_file');
  xhr.send(fd);
}
window.uploadFile = uploadFile;

function cancelCurrentUpload() {
  if (activeUploadXhr && !uploadAwaitingServer) {
    activeUploadXhr.abort();
  }
}
window.cancelCurrentUpload = cancelCurrentUpload;

function uploadProgress(evt) {
  var pv = document.getElementById('progress-value');
  if (evt.lengthComputable && evt.total > 0) {
    var percent = Math.min(100, Math.round(evt.loaded * 100 / evt.total));
    if (percent >= 100) {
      pv.textContent = '已发送完毕，正在写入服务器…';
      setProgressVisual(100, 'saving');
      setUploadingState(true, true);
    } else {
      pv.textContent = percent + '% (' + formatFileSize(evt.loaded) + ' / ' + formatFileSize(evt.total) + ')';
      setProgressVisual(percent, '');
    }
  } else {
    pv.textContent = '上传中…';
  }
}

function showResultBox(message, isError, allowRetry) {
  var result = document.getElementById('result');
  var resultActions = document.getElementById('resultActions');
  var retryBtn = document.getElementById('retryUploadBtn');
  var continueBtn = document.getElementById('continueUploadBtn');
  if (result) {
    result.classList.toggle('is-error', !!isError);
    result.textContent = message;
    result.style.display = 'block';
  }
  if (resultActions) resultActions.hidden = false;
  if (retryBtn) retryBtn.hidden = !(isError && allowRetry !== false);
  if (continueBtn) continueBtn.hidden = !!isError;
}

function uploadComplete(evt) {
  var committedKeys = activeBatchKeys;
  activeUploadXhr = null;
  activeBatchKeys = null;
  setUploadingState(false, false);

  var response = {};
  try {
    response = JSON.parse(evt.target.responseText || '{}');
  } catch (error) {
    response = { message: evt.target.responseText || '服务器返回了无法识别的响应' };
  }

  if (evt.target.status >= 200 && evt.target.status < 300 && response.status === 'ok') {
    if (committedKeys) {
      selectedUploadFiles = selectedUploadFiles.filter(function(f) { return !committedKeys.has(fileKey(f)); });
    }
    lastFailedBatchFiles = [];
    var targetPaths = response.target_paths || [response.target_path];
    showResultBox('已上传 ' + targetPaths.length + ' 个文件：\n' + targetPaths.join('\n'), false, false);
    renderUploadQueue();
    document.getElementById('progress-value').textContent = '100% · 上传成功';
    setProgressVisual(100, 'success');
    toast('成功上传 ' + targetPaths.length + ' 个文件', 'success');
    return;
  }

  var errMsg = response.message || '上传失败，请稍后重试';
  showResultBox(errMsg, true, true);
  document.getElementById('progress-value').textContent = '上传失败';
  setProgressVisual(100, 'error');
  toast(errMsg, 'error');
}

function uploadFailed() {
  var wasAwaiting = uploadAwaitingServer;
  activeUploadXhr = null;
  activeBatchKeys = null;
  setUploadingState(false, false);
  var msg = wasAwaiting
    ? '连接在服务器写入阶段中断，保存结果未确认。请先打开目标目录核对文件是否已落盘，再决定是否重试。'
    : '上传失败，请检查网络连接后重试';
  showResultBox(msg, true, !wasAwaiting);
  document.getElementById('progress-value').textContent = wasAwaiting ? '保存结果未确认' : '上传失败';
  setProgressVisual(100, 'error');
  toast(wasAwaiting ? '保存结果未确认，请先检查目标目录' : msg, 'error');
}

function uploadCanceled() {
  var wasAwaiting = uploadAwaitingServer;
  activeUploadXhr = null;
  activeBatchKeys = null;
  setUploadingState(false, false);
  if (wasAwaiting) {
    var msg = '请求在服务器保存阶段中断，文件可能已落盘，请先检查目标目录。';
    showResultBox(msg, true, false);
    document.getElementById('progress-value').textContent = '保存结果未确认';
    setProgressVisual(100, 'error');
    toast('保存结果未确认，请先检查目标目录', 'error');
    return;
  }
  setProgressVisual(0, '');
  document.getElementById('progress-value').textContent = '已取消';
  toast('上传已取消', 'default');
}

window.addEventListener('DOMContentLoaded', function () {
  var input = document.querySelector('#file');
  if (input) input.addEventListener('change', updateSelectedFiles);
  renderUploadQueue();
});
