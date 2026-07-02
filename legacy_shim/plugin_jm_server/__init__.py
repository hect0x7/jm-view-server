"""
[已弃用] plugin_jm_server 已更名为 jm_view_server。

本包仅为兼容旧用户保留，内部转发到新包 jm_view_server。
请尽快改用: pip install jm-view-server, 并把 import 从
`plugin_jm_server` 改为 `jm_view_server`。CLI 命令 `jms` 与
jmcomic 插件 key `jm_server` 均保持不变。
"""
import warnings

warnings.warn(
    "plugin_jm_server 已更名为 jm_view_server，请改用 "
    "`pip install jm-view-server` 并 `import jm_view_server`。"
    "本包将在后续版本停止维护。",
    DeprecationWarning,
    stacklevel=2,
)

# 转发新包的公共 API 与版本，保证 `from plugin_jm_server import JmServer` 等旧用法可用
from jm_view_server import *          # noqa: F401,F403
from jm_view_server import __version__  # noqa: F401
