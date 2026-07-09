# Changelog

本文件记录 TextMind 各版本的主要变更。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [Unreleased]

### Added
- **命令面板**（`Ctrl+Shift+P`）：搜索并执行所有已注册命令
- **快速打开文件**（`Ctrl+P`）：在工作区中模糊搜索文件名，快速跳转
- **全局搜索**（`Ctrl+Shift+F`）：跨文件文本搜索，侧栏展示结果，点击跳转
- **文件外部修改检测**：当已打开的文件被外部工具修改时，顶部横幅提示用户重新加载或忽略
- **生产环境日志输出**：日志写入 `%AppData%/TextMind/textmind.log`，5MB 自动轮转
- **PluginCall 桥方法注册**：外置插件可通过 `pluginCall` 调用 14 个后端方法（text.dedupe、ai.fetchModels、fs.readFile 等）
- **文件系统模块** (`textmind.fs`)：新增 `fs.readFile` / `fs.writeFile` 桥方法，受权限标签控制

### Changed
- 更新检查 TTL 从 5 分钟延长至 1 小时，减少 GitHub API 配额消耗
- 更新缓存增加磁盘持久化（`update-cache.json`），ETag 跨重启生效

### Removed
- 删除遗留 `editor/` 目录（基于 Fyne 的早期原型，已无引用）
- 移除 `fyne.io/fyne/v2` 依赖及约 15 个关联间接依赖

### Fixed
- 修复 `inlist` 包测试用例与实现不一致的问题（测试期望双引号，实现用单引号）

---

## [v0.0.8] - 2026-05-29

### Added
- 插件化架构重构：前端 13 个内置插件 + 后端模块宿主
- Markdown 所见即所得编辑器（Milkdown）+ Source/WYSIWYG 切换
- 4 套主题（墨夜 / 晨纸 / 夜樱 / 羊皮卷）
- 布局优化与自适应

### Fixed
- 修复 Markdown 输入问题
- 修复文件打开相关 BUG

---

## [v0.0.7] - 2026-05-20

### Changed
- 项目重命名为 TextMind

---

## [v0.0.6] - 2026-05-20

### Added
- 多编码支持（GBK / Big5 / Shift_JIS 等，基于 chardet 自动检测）

### Fixed
- 去掉重复的菜单项

---

## [v0.0.5] - 2026-05-11

### Fixed
- 修复列编辑模式的显示问题
- 修复 JSON 数字处理问题

---

## [v0.0.4] - 2026-05-11

### Added
- 优化 JSON 格式化显示

### Changed
- 优化自动更新流程（staging 目录、限流/304、前端 UI）

---

## [v0.0.3] - 2026-05-07

### Fixed
- 修复格式化 JSON 的 BUG

### Added
- 代码语法高亮

---

## [v0.0.2] - 2026-04-28

### Added
- AI 聊天侧边面板（OpenAI 兼容协议）
- 文本提取功能（filter / capture / block 三种模式）

---

## [v0.0.1] - 2026-04-27

### Added
- 初始版本发布
- 多标签 Monaco 编辑器
- 文件浏览器 + 工作区
- 文本处理工具集（去重 / 单次 / 重复 / IN 列表 / 模板批量生成）
- 文本对比（Monaco DiffEditor）
- 会话自动恢复
- GitHub Actions 自动构建

---

[Unreleased]: https://github.com/jycoast/TextMind/compare/v0.0.8...HEAD
[v0.0.8]: https://github.com/jycoast/TextMind/compare/v0.0.7...v0.0.8
[v0.0.7]: https://github.com/jycoast/TextMind/compare/v0.0.6...v0.0.7
[v0.0.6]: https://github.com/jycoast/TextMind/compare/v0.0.5...v0.0.6
[v0.0.5]: https://github.com/jycoast/TextMind/compare/v0.0.4...v0.0.5
[v0.0.4]: https://github.com/jycoast/TextMind/compare/v0.0.3...v0.0.4
[v0.0.3]: https://github.com/jycoast/TextMind/compare/v0.0.2...v0.0.3
[v0.0.2]: https://github.com/jycoast/TextMind/compare/v0.0.1...v0.0.2
[v0.0.1]: https://github.com/jycoast/TextMind/releases/tag/v0.0.1
