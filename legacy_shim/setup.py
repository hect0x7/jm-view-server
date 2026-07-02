"""
旧包 plugin_jm_server 的打包脚本（重定向薄壳）。

单独发布, 与主包 jm-view-server 互不干扰:
    cd legacy_shim && python -m build && twine upload dist/*

作用: 装了旧包名的用户 `pip install plugin_jm_server` 时,
会自动带上新包 jm-view-server, 且旧的 import / `jms` 命令仍可用,
运行时打印 DeprecationWarning 引导迁移。
"""
from setuptools import setup, find_packages

setup(
    name='plugin_jm_server',
    version='0.2.4',
    description='[DEPRECATED] Renamed to jm-view-server. Installs jm-view-server and forwards to it.',
    long_description=(
        '# plugin_jm_server 已更名\n\n'
        '本包已更名为 **jm-view-server**，此处仅保留为兼容旧用户的重定向薄壳。\n\n'
        '请改用：\n\n'
        '```shell\n'
        'pip install jm-view-server\n'
        '```\n\n'
        '`import jm_view_server` 代替 `import plugin_jm_server`；'
        'CLI 命令 `jms` 与 jmcomic 插件 key `jm_server` 保持不变。\n'
    ),
    long_description_content_type="text/markdown",
    url='https://github.com/hect0x7/plugin-jm-server',
    author='hect0x7',
    author_email='93357912+hect0x7@users.noreply.github.com',
    packages=find_packages(),
    python_requires=">=3.7",
    # 关键: 安装旧包自动带上新包
    install_requires=[
        'jm-view-server',
    ],
    keywords=['python', 'jmcomic', 'jm-view-server', '18comic', '禁漫天堂', 'NSFW', 'deprecated'],
    classifiers=[
        "Development Status :: 7 - Inactive",
    ],
    # 不注册 jms 命令: jms 始终由主包 jm-view-server 提供,
    # 避免同时安装两个包时旧包覆盖主包、导致每次都弹弃用告警。
)
