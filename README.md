<!-- 顶部标题 & 统计徽章 -->
<div align="center">
  <img src="images/logo.png" width="180" alt="jm-view-server logo">
  <h1 style="margin-top: 15px" align="center">jm-view-server</h1>

  <p align="center">
  <strong>“离线版”禁漫天堂，你的纯本地 离线看本神器！</strong>
  </p>

[![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github)](https://github.com/hect0x7)
[![Stars](https://img.shields.io/github/stars/hect0x7/jm-view-server?color=orange&label=stars&style=flat)](https://github.com/hect0x7/jm-view-server/stargazers)
[![Forks](https://img.shields.io/github/forks/hect0x7/jm-view-server?color=green&label=forks&style=flat)](https://github.com/hect0x7/jm-view-server/forks)
[![PyPI](https://img.shields.io/pypi/v/jm-view-server?color=blue&label=version)](https://pypi.org/project/jm-view-server/)
[![PyPI - Downloads](https://img.shields.io/pypi/dm/jm-view-server?style=flat&color=hotpink)](https://pepy.tech/projects/jm-view-server)
[![Licence](https://img.shields.io/github/license/hect0x7/jm-view-server?color=red)](https://github.com/hect0x7/jm-view-server)


</div>

> 该项目会在你的电脑上启动一个**本地文件服务器**。你可以直接在浏览器（手机或电脑）中打开它，它会把本地文件夹里的图片转换成类似“禁漫天堂”的章节观看页面。
> 
> **核心优势**：
> - 支持各种强大的浏览器插件和脚本，例如[双页阅读插件](https://sleazyfork.org/zh-CN/scripts/374903-comicread)。
> - 一键开启局域网共享，电脑下载，躺在床上用手机看。
> 
> 从 v0.2.4 起，本项目正式更名为 `jm-view-server`，原名 `plugin-jm-server`，安装了旧包的老用户请参考文末的 [老用户迁移指南](#老用户迁移指南) 进行升级。

![架构与流程图](https://raw.githubusercontent.com/hect0x7/hect0x7/master/images/jmcomic-intro-main.png)

---

## 🌟 效果展示

### 1. 文件夹管理
- **快捷查找**：支持网格和列表两种布局，鼠标悬停在文件夹上就能自动预览内部的第一张图片。
- **书签直达**：一键将常看的目录收纳至侧边栏书签，下次打开无需一层层寻找。
- **日夜间模式**：内置深浅双色主题，自动记住你的偏好，夜间使用不刺眼。

*(电脑端：列表视图)* ![](images/pc-index-list-mode.png)
*(电脑端：网格视图)* ![](images/pc-index-grid-mode.png)
*(手机端：文件夹列表)* ![](images/mobile-index-list-mode.png)

### 2. 看本模式（模仿JM章节阅读页面）
- **进度无缝接续**：自动记住上次读到了哪一页，下次点开时会直接提示，一键接着看。
- **操作顺手**：电脑端支持键盘方向键翻页，手机端则专门优化了触屏排版和单手操作；还能随时切换暖色护眼模式。
- **看大长篇也不卡**：智能分段加载图片，几十甚至上百张大图的章节也能顺畅向下滑动，无需等待全部下载完毕。

*(电脑端：看本模式)* ![](images/pc-jm-view.png)
*(手机端：看本模式)* ![](images/mobile-jm-view.jpg)

### 3. 其他功能
- **隐私防护**：怕被同路由器的室友或家人看到？开启登录密码，或者只允许特定的设备 IP 访问。
- **多端互动**：不仅可以直接把文件拖进网页传到电脑里，还能在内置的“消息中心”和其他连入的设备互相发文字消息。

*(登录密码验证)* ![](images/pc-login.png)
*(局域网消息界面)* ![](images/pc-message.png)

---

## 🚀 小白快速上手指南

如果你不懂编程，请严格按照以下两步操作即可：

### 第一步：环境准备
本项目基于 Python 开发，因此你的电脑必须先安装 Python。
- 请前往 [Python 官网](https://www.python.org/downloads/) 下载并安装最新版 Python（安装时请务必勾选 `Add Python to PATH`）。

### 第二步：一键安装与启动
打开你电脑的**命令行终端**，复制并执行对应的命令：

- **Windows** (PowerShell):
  ```powershell
  pip install jm-view-server ; jms
  ```
- **macOS / Linux**:
  ```bash
  pip3 install jm-view-server && jms
  ```

> **提示**：这行命令会帮你自动下载安装必要的组件，并以默认配置启动服务器。如果提示 80 端口无权限，可以参考下方进阶参数指定高位端口（如 `-p 8080`）。

**启动成功后怎么用？**
终端里会打印出两行地址，例如：
- 本机访问：`http://127.0.0.1:80`
- 局域网访问：`http://192.168.1.100:80`

你只需要在电脑的浏览器里打开第一个地址，或者在连着同一个 WiFi 的手机浏览器里打开第二个地址，就可以开始看漫画了！

> **提示**：如果在终端没看清局域网地址也没关系，当你用电脑打开本机地址后，**网页的主页顶部也会直接显示并智能识别当前的局域网地址**，你可以一键复制发给手机直接访问。

---

## ⚙️ 进阶使用（针对有经验的用户）

安装后系统会注册 `jms` 命令，无需写代码即可通过丰富的参数进行个性化启动：

```shell
# 共享指定目录 ~/comics，并使用 8080 端口（高位端口无需管理员权限）
jms ~/comics -p 8080

# 设置登录密码为 123，并启用 HTTPS
jms ~/comics -P 123 -s

# 仅允许指定 IP 的设备访问
jms ~/comics --ip-whitelist 192.168.1.10,192.168.1.11

# 加载 jmcomic 配置开启在线下载
jms ~/comics -o op.yml
```

**全部参数说明（可通过 `jms -h` 查看）：**
| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `path` | 要共享的根目录（位置参数） | 当前目录 |
| `-P, --password` | 登录密码，空表示免密 | 空 |
| `-H, --host` | 监听地址 | `0.0.0.0` |
| `-p, --port` | 监听端口 | `80` |
| `-s, --ssl` | 启用 HTTPS（adhoc 自签名） | 关闭 |
| `-o, --option` | [jmcomic](https://github.com/hect0x7/JMComic-Crawler-Python) 配置文件路径，开启在线下载 | 无 |
| `--ip-whitelist` | IP 白名单，逗号分隔 | 不限制 |
| `--current-path` | 初始当前路径 | 同 `path` |
| `-e, --env` | 设置环境变量 `KEY=VALUE`，可重复 | 无 |
| `--debug` | 开启 Flask debug 模式 | 关闭 |

> 注：如果你在 Linux/macOS 上启动报错没有权限，是因为绑定默认的 80 端口需要管理员权限。建议加上 `-p 8080` 参数改用其他端口。

---

## 👨‍💻 开发者专属区域

如果你想在自己的 Python 脚本中集成或二次开发该服务，可以通过代码进行调用。

### 1. HTTP / HTTPS 原生调用
```python
from jm_view_server import *

# 启动 HTTP 服务
server = JmServer('D:/', 'password')
server.run(host='0.0.0.0', port=80)

# 启动 HTTPS 服务 (需要安装 cryptography)
server.run(host='0.0.0.0', port=443, ssl_context='adhoc')
```

### 2. 作为 jmcomic 的插件集成
你可以在 `jmcomic` 的 `op.yml` 配置文件中配置它：
```yml
plugins:
  after_init: 
    - plugin: jm_server
      kwargs:
        password: ''
```
对应的启动脚本注意事项：
```python
from jmcomic import *

op = create_option('op.yml')
op.download_album(123)

# 注意：虽然爬虫主线程执行完毕，但 Web 服务器线程仍在运行中。
# 需要用户手动按 Ctrl+C 退出。
# Python 3.12+ 特别注意：必须插入下面这行代码，Web 服务器才能继续处理请求！
op.wait_all_plugins_finish()
```

---

## 老用户迁移指南

原名 `plugin-jm-server` 里的 `plugin-` 前缀会让人误以为它必须搭配 jmcomic 才能用。其实它**首先是一个可独立运行的本地看本服务器**，jmcomic 插件只是附加能力，因此更名为 `jm-view-server`。

**老用户迁移** —— 一行搞定：
```shell
pip uninstall -y plugin_jm_server && pip install jm-view-server
```

命令行 `jms` 和 jmcomic 插件 key `jm_server` **都不变**；脚本里把 `import plugin_jm_server` 换成 `import jm_view_server` 即可（不换也行，旧包名仍能用）。

> 旧包 `plugin_jm_server` 仍保留在 PyPI 上做**重定向薄壳**：安装它会自动带上 `jm-view-server`，旧的 `import` 和 `jms` 命令继续可用，仅在导入时打印一条弃用提示。建议尽快迁移到新包名。

---

## 💡 想法起源

- 想法起源：https://github.com/hect0x7/JMComic-Crawler-Python/issues/192
- UI 与部分基础架构参考：https://github.com/AiCorein/Flask-Files-Server
