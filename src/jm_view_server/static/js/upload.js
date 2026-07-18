function fileSelected() {
  var displayBtn = document.querySelector('#displayInfo');
  
  // 选择显示信息或不显示信息
  if (displayBtn.innerHTML == '显示信息') {
    var file = document.getElementById('file').files[0];
    if (file) {
      var fileSize = 0;
      if (file.size > 1024 * 1024)
        fileSize = (Math.round(file.size * 100 / (1024 * 1024)) / 100).toString() + 'MB';
      else
        fileSize = (Math.round(file.size * 100 / 1024) / 100).toString() + 'KB';
      document.getElementById('fileSize').innerHTML = '大小: ' + fileSize;
      document.getElementById('fileType').innerHTML = '类型: ' + file.type;
      displayBtn.innerHTML = '隐藏信息';
    }
  }
  else {
    document.getElementById('fileSize').innerHTML = '';
    document.getElementById('fileType').innerHTML = '';
    displayBtn.innerHTML = '显示信息';
  }
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
  fd.append("file", fileInput.files[0]);
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
    result.textContent = '已上传到：' + response.target_path;
    document.getElementById('progress-value').textContent = '100% · 上传成功';
    document.getElementById('mask').style.left = '100%';
    toast('上传成功，文件已保存到目标路径', 'success');
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
  // 选择文件后弹出提示
  (function () {
    var fileInput = document.querySelector('#file');
    var fileNameTip = document.getElementById('fileName');

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) {
        fileNameTip.textContent = '已选: ' + fileInput.files[0].name;
      }
    })
  }());
})
