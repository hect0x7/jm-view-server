window.addEventListener('DOMContentLoaded', function () {
  // 两个浮动面板
  var flashTablet = document.querySelector('.flash-tablet');
  var driversContainer = document.querySelector('.drivers-container');
  var contentPart = document.querySelector('.content');

  flashTablet.style.height = driversContainer.offsetHeight + 'px';
  contentPart.style.top = flashTablet.style.height;

  // 点击驱动器标号或点击文件夹触发更新
  var driverLinks = document.querySelectorAll('.drivers-container a');
  var pathCon = document.querySelector('#pathForm input[type="text"]');
  var SubmitBtn = document.querySelector('#pathForm input[type="submit"]')

  for (let i = 0; i < driverLinks.length; i++) {
    driverLinks[i].addEventListener('click', function (e) {
      e.preventDefault();
      pathCon.value = driverLinks[i].getAttribute('location');
      SubmitBtn.click();
    })
  }

  var dirLinks = document.querySelectorAll('.dir a');
  var curPathCons = document.querySelectorAll('.currentPath span');

  for (let i = 0; i < dirLinks.length; i++) {
    dirLinks[i].addEventListener('click', function (e) {
      e.preventDefault();
      var pathText = curPathCons[0].innerHTML;

      if (pathText[pathText.length - 1] == '/') { }
      else {
        pathText += '/';
      }
      pathCon.value = pathText + this.getAttribute('dirname');
      SubmitBtn.click();
    })
  }
})
