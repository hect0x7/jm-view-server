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

## 🌟 功能与界面展示

本项目不仅提供了简单的文件浏览，还专为漫画阅读进行了深度优化：

### 1. 智能资源管理（文件夹浏览页）
- **路径导航**：输入框自动补全路径，快速定位。
- **封面预览**：鼠标悬停在文件夹上，自动展示首张图片作为封面。
- **书签收藏**：将常看目录加入左侧书签，方便下次访问。

![](images/4.png)
*(电脑端：文件夹与看本二合一模式)* ![](images/8.png)
*(手机端：文件夹列表)* ![](images/2.png)

### 2. 沉浸式阅读体验（看本模式）
- **懒加载极速浏览**：哪怕一个章节有几百张高清大图，也能秒开且不卡顿。
- **多端适配**：无论是在宽屏显示器还是手机触摸屏上，都有最舒适的阅读排版。
- **快捷交互**：支持键盘翻页、浮动工具栏快速回到顶部等。

*(电脑端：看本模式)* ![](images/5.png)
*(手机端：看本模式)* ![](images/7.jpeg)

### 3. 局域网消息与隐私保护
- **消息中心**：电脑和手机在局域网内可互传文本消息，实时弹窗提醒（v0.2.2+ 新功能）。
- **密码验证**：支持设置访问密码，防止同处局域网的其他室友/家人偷看！

*(局域网消息界面)* ![](images/9.png)
*(登录密码验证)* ![](images/3.png)

---

## 🚀 小白快速上手指南

如果你不懂编程，请严格按照以下两步操作即可：

### 第一步：环境准备
本项目基于 Python 开发，因此你的电脑必须先安装 Python。
- 请前往 [Python 官网](https://www.python.org/downloads/) 下载并安装最新版 Python（安装时请务必勾选 `Add Python to PATH`）。

### 第二步：一键安装与启动
打开你电脑的**命令行终端**（Windows 下按 `Win+R` 输入 `cmd`，Mac 下打开“终端”APP），复制并执行下面这行命令：

```shell
pip install jm-view-server && jms
```

> **提示**：这行命令会帮你自动下载安装必要的组件，并以默认配置（分享当前所在目录、端口80）启动服务器。

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
