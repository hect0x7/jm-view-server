# 更新记录

本文件记录 `jm-view-server` 的重要版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [v0.3.1] - 2026-08-07

### Added

- 新增 Finder 风格分栏文件视图，桌面端最多展示四层目录，继续深入时自动向左推进。
- 新增分栏操作入口开关，并与设置页及其他浏览器标签页同步偏好。
- 新增分栏目录增量加载、路径恢复、键盘导航和窄屏单列导航。

### Changed

- 多选模式下可直接点击列表行或网格卡片切换选择。
- 统一上传目标目录、快捷方式管理和删除安全边界。
- 优化桌面端与移动端布局，并减少设置交互导致的页面跳动。
- 补充分栏浏览及相关交互的单元测试。
- 将 README 顶部的逐版本更新公告迁移到本文件，保留原有功能预览与使用说明结构。
- 在 README 项目介绍中增加更新记录入口。
- 自动发布时优先使用当前版本的 changelog 章节作为 GitHub Release 内容。

## [v0.3.0] - 2026-07-19

### Added

- 新增无缝双页阅读模式，支持纵图成对、横图跨页和左右阅读方向。
- 新增双页画面比例调节、桌面工具栏固定状态和滚动进度反馈。

### Changed

- 将阅读器样式与交互拆分到独立的 `reader.css` 和 `reader.js`。
- 完善连续下拉、单页和双页模式间的偏好同步与响应式行为。

## [v0.2.9] - 2026-07-18

### Added

- 新增单页阅读模式及点击、方向键、PageUp、PageDown 和空格翻页。
- 新增独立设置中心，集中管理主题、文件视图、阅读和消息偏好。

### Changed

- 清理不再使用的旧移动端模板、Bootstrap 样式和 jQuery 插件。

## [v0.2.8] - 2026-07-11

### Changed

- 重构无缝连播，默认关闭并减少阅读界面干扰。
- 将阅读页缩放控制改为弹出面板。

### Fixed

- 修复收藏夹长文件名单行截断问题。

## [v0.2.7] - 2026-07-11

### Fixed

- 修复文件下载链接跳转时丢失真实目录参数的问题。

## [v0.2.6] - 2026-07-11

### Added

- 新增局域网消息复制和双击气泡复制。
- 新增消息页使用提示卡片。

### Changed

- 优化移动端输入区排版与消息选区高亮。

## [v0.2.5] - 2026-07-06

### Added

- 新增阅读护眼模式、专用 SVG 图标和独立图片文件的看本入口。
- 面包屑支持手动输入绝对路径跳转。

### Changed

- 优化阅读、消息、主题和移动端输入区域的交互与排版。

### Fixed

- 修复移动端滑动破图、工具栏双击冲突、RTL 面包屑错位和列表预览图裁切。

## [v0.2.4] - 2026-07-06

### Added

- 新增深浅主题、阅读进度记忆、键盘快捷键、PWA 安装、文件删除、批量操作和打包下载。

### Changed

- 项目由 `plugin-jm-server` 更名为 `jm-view-server`，CLI `jms` 与插件 key `jm_server` 保持不变。
- 主链路改为统一的响应式界面。

### Security

- 修复路径逃逸和 Session 伪造风险。

## 更早版本

v0.1.0 至 v0.2.3 主要完成了离线漫画浏览、移动端适配、HTTPS、IP 白名单、图片排序、在线下载 SSE、SPA、局域网消息和 `jms` CLI。详细提交与标签见 [GitHub Tags](https://github.com/hect0x7/jm-view-server/tags)。

[v0.3.1]: https://github.com/hect0x7/jm-view-server/compare/v0.3.0...v0.3.1
[v0.3.0]: https://github.com/hect0x7/jm-view-server/compare/v0.2.9...v0.3.0
[v0.2.9]: https://github.com/hect0x7/jm-view-server/compare/v0.2.8...v0.2.9
[v0.2.8]: https://github.com/hect0x7/jm-view-server/compare/v0.2.7...v0.2.8
[v0.2.7]: https://github.com/hect0x7/jm-view-server/compare/v0.2.6...v0.2.7
[v0.2.6]: https://github.com/hect0x7/jm-view-server/compare/v0.2.5...v0.2.6
[v0.2.5]: https://github.com/hect0x7/jm-view-server/compare/v0.2.4...v0.2.5
[v0.2.4]: https://github.com/hect0x7/jm-view-server/releases/tag/v0.2.4
