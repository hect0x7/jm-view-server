function fileSelected() {
  var displayBtn = document.querySelector('#displayInfo');
  var files = Array.prototype.slice.call(document.getElementById('file').files);
  var info = document.getElementById('info');

  if (!files.length) {
    toast('请先选择需要上传的文件', 'error');
    return;
  }

  var isExpanded = displayBtn.getAttribute('aria-expanded') === 'true';
  displayBtn.setAttribute('aria-expanded', String(!isExpanded));
  displayBtn.lastChild.textContent = isExpanded ? ' 显示信息' : ' 隐藏信息';
  info.replaceChildren();
  if (isExpanded) return;

  var list = document.createElement('ul');
  list.className = 'file-detail-list';
  files.forEach(function(file) {
    var item = document.createElement('li');
    item.textContent = file.name + ' · ' + formatFileSize(file.size) +
      (file.type ? ' · ' + file.type : '');
    list.appendChild(item);
  });
  info.appendChild(list);
}

function formatFileSize(size) {
  if (size >= 1024 * 1024) return (Math.round(size * 100 / (1024 * 1024)) / 100) + ' MB';
  return (Math.round(size * 100 / 1024) / 100) + ' KB';
}

function updateSelectedFiles() {
  var files = Array.prototype.slice.call(document.getElementById('file').files);
  var fileNameTip = document.getElementById('fileName');
  var totalSize = files.reduce(function(total, file) { return total + file.size; }, 0);

  document.getElementById('info').replaceChildren();
  document.getElementById('displayInfo').setAttribute('aria-expanded', 'false');
  document.getElementById('displayInfo').lastChild.textContent = ' 显示信息';
  if (!files.length) {
    fileNameTip.textContent = '尚未选择文件';
    document.getElementById('fileSize').textContent = '';
    document.getElementById('fileType').textContent = '';
    return;
  }

  fileNameTip.textContent = files.length === 1 ? '已选: ' + files[0].name : '已选择 ' + files.length + ' 个文件';
  document.getElementById('fileSize').textContent = '总大小: ' + formatFileSize(totalSize);
  document.getElementById('fileType').textContent = files.length === 1 && files[0].type ? '类型: ' + files[0].type : '';
}
function uploadFile() {
  var fileInput = document.getElementById('file');
  var uploadButton = document.getElementById('submit');
  var result = document.getElementById('result');

  if (!fileInput.files.length) {
    toast('请先选择需要上传的文件', 'error');
    return;
  }

  // 发送文件的异步请求
  var fd = new FormData();
  Array.prototype.forEach.call(fileInput.files, function(file) {
    fd.append("file", file);
  });
  var uploadTarget = document.getElementById('uploadTarget');
  if (uploadTarget) fd.append('path', uploadTarget.textContent.trim());
  result.style.display = 'none';
  result.textContent = '';
  uploadButton.disabled = true;
  document.getElementById('progress-value').textContent = '准备上传';

  var xhr = new XMLHttpRequest();
  xhr.upload.addEventListener("progress", uploadProgress, false);
  xhr.addEventListener("load", uploadComplete, false);
  xhr.addEventListener("error", uploadFailed, false);
  xhr.addEventListener("abort", uploadCanceled, false);
  xhr.open("POST", "/upload_file");
  xhr.send(fd);
}
function uploadProgress(evt) {
  // 进度条控制相关
  if (evt.lengthComputable) {
    var percent = Math.round(evt.loaded * 100 / evt.total);

    document.getElementById('progress-value').innerHTML = percent.toFixed(2) + '%';
    document.getElementById('mask').style.left = percent.toFixed(2) + '%';
  }
  else {
    document.getElementById('progress-value').innerHTML = 'unable to compute';
  }
}
function uploadComplete(evt) {
  // 服务器端返回响应时候触发event事件
  var response = {};
  var result = document.getElementById('result');
  var uploadButton = document.getElementById('submit');

  try {
    response = JSON.parse(evt.target.responseText || '{}');
  } catch (error) {
    response = { message: evt.target.responseText || '服务器返回了无法识别的响应' };
  }

  uploadButton.disabled = false;
  result.style.display = 'block';

  if (evt.target.status >= 200 && evt.target.status < 300 && response.status === 'ok') {
    var targetPaths = response.target_paths || [response.target_path];
    result.textContent = '已上传 ' + targetPaths.length + ' 个文件：\n' + targetPaths.join('\n');
    document.getElementById('progress-value').textContent = '100% · 上传成功';
    document.getElementById('mask').style.left = '100%';
    toast('成功上传 ' + targetPaths.length + ' 个文件', 'success');
    return;
  }

  result.textContent = response.message || '上传失败，请稍后重试';
  document.getElementById('progress-value').textContent = '上传失败';
  toast(result.textContent, 'error');
}
function uploadFailed(evt) {
  document.getElementById('submit').disabled = false;
  document.getElementById('progress-value').textContent = '上传失败';
  toast('上传失败，请检查网络连接', 'error');
}
function uploadCanceled(evt) {
  document.getElementById('submit').disabled = false;
  document.getElementById('progress-value').textContent = '上传已取消';
  toast('上传已取消', 'default');
}

window.addEventListener('load', function () {
  document.querySelector('#file').addEventListener('change', updateSelectedFiles);
})
