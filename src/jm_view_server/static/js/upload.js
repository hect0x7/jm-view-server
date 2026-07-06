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
  // 发送文件的异步请求
  var fd = new FormData();
  fd.append("file", document.getElementById('file').files[0]);
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
  var message = evt.target.responseText;
  document.getElementById('result').innerHTML = message;
  alert(message);
  document.getElementById('progress-value').innerHTML += ' (上传成功)'
}
function uploadFailed(evt) {
  alert("There was an error attempting to upload the file.");
}
function uploadCanceled(evt) {
  alert("The upload has been canceled by the user or the browser dropped the connection.");
}

window.addEventListener('load', function () {
  // 选择文件后弹出提示
  (function () {
    var fileInput = document.querySelector('#file');
    var fileNameTip = document.getElementById('fileName');

    fileInput.addEventListener('change', function () {
      fileNameTip.innerHTML = '已选: ' + fileInput.files[0].name;
    })
  }());
})
