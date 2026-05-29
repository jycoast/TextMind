# TextMind

> 一个为「批量文本处理 + Markdown 写作 + AI 协作」而生的轻量级 Windows 桌面编辑器。

TextMind 基于 [Wails v2](https://wails.io/)（Go）+ [Vue 3](https://vuejs.org/) + [Monaco Editor](https://microsoft.github.io/monaco-editor/) + [Milkdown](https://milkdown.dev/) 构建，把多标签编辑、文件浏览、Markdown 所见即所得、文本对比、常用文本处理工具，以及兼容 OpenAI 协议的 AI 对话 / 选区改写整合到同一个原生应用里。所有数据均落地到本地，不依赖任何云服务（除非显式开启图床上传）。

整个产品采用「极薄内核 + 插件化前后端」的架构：除了 `TopBar / EditorHost / SidePanels / Modals` 这几个宿主，其它所有可见功能（菜单项、命令、设置页、状态栏按钮、编辑器实现……）都来自内置或外置插件，可以按需启用 / 禁用。

---

## 目录

- [核心特性](#核心特性)
- [安装与使用](#安装与使用)
- [快捷键](#快捷键)
- [主题](#主题)
- [AI 配置](#ai-配置)
- [腾讯云 COS 图床](#腾讯云-cos-图床)
- [插件系统](#插件系统)
- [自动更新](#自动更新)
- [从源码构建](#从源码构建)
- [项目结构](#项目结构)
- [测试](#测试)
- [致谢](#致谢)
- [License](#license)

---

## 核心特性

### 编辑器与会话

- **多标签编辑器**：基于 Monaco，支持语法高亮、Minimap、列编辑、拖拽排序、查找替换（`Ctrl+F` / `Ctrl+H`）。
- **Markdown 所见即所得**：基于 Milkdown 的 Typora 风格 WYSIWYG 编辑器，状态栏一键在「Source / WYSIWYG」之间切换；不需要任何额外安装。
- **Markdown 大纲面板**（`Ctrl+Shift+O`）：左侧侧栏自动抽取标题层级，点击跳转到对应位置；仅在 Markdown 标签页显示。
- **文件浏览器**：左侧目录树，可打开任意工作区文件夹，支持文件 / 目录排序、刷新。
- **会话自动恢复**：标签内容、未保存修改、当前工作区、最近文件，下次启动原样还原（含 Monaco 视图状态）。
- **命令行 / 拖拽打开**：把文件路径作为参数传给 `TextMind.exe`，或直接把文件拖到窗口里，即可在新会话中打开。
- **自动识别语言**：根据扩展名 + 内容启发式判定，支持手动覆盖。

### 文本处理工具集（无 AI 也能用）

| 功能 | 说明 |
| --- | --- |
| **去重** | 对选区按行去重，结果区显示去掉的行数 |
| **保留单次出现项** | 仅保留只出现过一次的行（差集常用） |
| **保留重复项** | 仅保留出现 ≥2 次的行 |
| **转 IN 列表** | 把多行文本转成 `'a','b','c'`，方便贴进 SQL `IN (...)` |
| **提取（Extract）** | 三种模式：`filter`（按关键字 / 正则保留或反选整行）、`capture`（正则捕获组提取子串）、`block`（按起止正则截取多行块） |
| **JSON 格式化 / 压缩** | 选区或全文，解析失败给出错误位置 |
| **模板批量生成** | 用占位符模板批量产出 SQL / 文本，`Ctrl+Shift+G` |
| **文本对比** | 左右两栏粘贴文本，基于 Monaco DiffEditor 实时高亮差异，支持忽略空白、并排 / 内联、交换、复制到新 Tab |
| **列编辑** | `Ctrl+Alt+L` 开关 Monaco 列选择模式 |

### AI 协作

- **AI 侧边面板**（`Ctrl+L` 开关）：多会话聊天界面，支持流式输出、Markdown 渲染、代码高亮、随时取消生成。
- **AI 询问选区**：编辑菜单或右键 → 「AI 询问选区...」，对当前选区做改写 / 翻译 / 解释，结果可：
  - 直接替换选区
  - 插入到光标位置
  - 转入 AI 面板继续追问
- **OpenAI 兼容协议**：可对接 OpenAI、DeepSeek、Moonshot、Azure OpenAI、本地 Ollama 等任何提供 `/v1/chat/completions` 与 `/v1/models` 的服务。
- **多会话管理**：会话标题自动总结、可重命名 / 删除 / 切换模型，本地持久化于 `%AppData%/TextMind/ai-conversations.json`。
- **API Key 安全存储**：AI 配置文件以 `0600` 权限保存在 `%AppData%/TextMind/ai-config.json`，不上传任何服务器。

### Markdown 协作扩展

- **Markdown 大纲**：标题树侧栏，定位长文档时极快。
- **腾讯云 COS 图床**：在 Markdown 标签里直接 `Ctrl+V` 粘贴截图，自动上传到你自己的 COS Bucket 并插入 `![](url)`。详见 [腾讯云 COS 图床](#腾讯云-cos-图床)。

### 应用集成

- **多套主题**：内置 4 套配色，编辑器、面板、原生窗口装饰会同步切换。详见 [主题](#主题)。
- **可配置快捷键**：所有应用级命令都可在「设置 → 快捷键设置」中自定义。
- **插件管理**：「设置 → 插件管理...」可查看 / 启用 / 禁用 / 配置内置与外置插件。
- **应用内更新**：定时（24 h 一次）静默检查 GitHub Release，Windows 用户可一键下载并自动重启完成升级。
- **轻量打包**：单个 `.exe`（约 10–20 MB），免安装、绿色运行。

---

## 安装与使用

### 直接下载（推荐）

到 [GitHub Releases](https://github.com/jycoast/TextMind/releases) 下载最新版本：

- `TextMind-vX.Y.Z-windows-amd64.exe` —— 单文件可执行程序，双击即用。
- `TextMind-vX.Y.Z-windows-amd64.zip` —— 压缩包版本。
- `SHA256SUMS.txt` —— 校验文件。

下载后建议先校验哈希：

```powershell
Get-FileHash .\TextMind-vX.Y.Z-windows-amd64.exe -Algorithm SHA256
```

### 系统要求

- Windows 10 / 11（amd64）
- 已安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 自带；Windows 10 大多数已随 Edge 安装）

---

## 快捷键

所有应用级动作的快捷键都可在 **设置 → 快捷键设置** 中按需自定义、清空或恢复默认。配置保存在 `UserConfigDir/TextMind/keymap.json`，仅记录与默认值不同的项。

默认绑定：

| 快捷键 | 命令 | 说明 |
| --- | --- | --- |
| `Ctrl+S` | `file.save` | 保存当前标签 |
| `Ctrl+F` | `edit.find` | 在当前编辑器里查找（Monaco / Milkdown 各有专属实现） |
| `Ctrl+Shift+G` | `edit.templateSql` | 打开模板批量生成 |
| `Ctrl+Alt+L` | `edit.toggleColumn` | 切换列编辑模式（仅 Monaco） |
| `Ctrl+L` | `ai.togglePanel` | 切换 AI 侧边面板 |
| `Ctrl+Shift+O` | `outline.toggle` | 切换 Markdown 大纲面板 |
| `Esc` | — | 关闭顶层弹窗 / 菜单（不可改） |

另有以下默认未绑定的动作，可在快捷键设置中按需挂载：打开文件、打开文件夹、自动识别语言、文本对比、提取文本、去重、保留单次出现项、保留重复项、转 IN 列表、格式化 JSON、压缩 JSON、插入选中文本到 AI 对话框、切换主题、切换 Markdown 源码 / 富文本模式 等。

> Monaco 自带的多光标 / 撤销重做 / 选词等内置键位（`Alt+点击`、`Ctrl+Z` 等）保持原生行为。全局快捷键监听运行在 **capture 阶段** 并仅在命中已注册命令时才阻止默认行为，因此不会破坏编辑器内部键位。

---

## 主题

TextMind 内置 4 套配色，编辑器、UI 面板、Wails 原生窗口装饰会一起切换：

| 主题 | 标签 | 风格 |
| --- | --- | --- |
| `dark` | 墨夜 (深色) | 深蓝灰底 + 暖白文字 + 青蓝强调 |
| `light` | 晨纸 (浅色) | 纯白底 + 深炭文字 + GitHub 蓝强调 |
| `sakura` | 夜樱 (深色) | Dracula 风：板岩紫底 + 樱粉 / 鸢尾紫强调 |
| `parchment` | 羊皮卷 (浅色) | Solarized Light 风：暖米黄底 + 经典蓝强调，护眼 |

切换入口：**设置 → 主题**。每个主题都有一套专属的 Monaco 配色（`tiny-minimal` / `tiny-light` / `tiny-sakura` / `tiny-parchment`），保证编辑器背景与面板背景视觉连贯。

选择会保存在 `localStorage["TextMind.theme"]`，下次启动自动应用。

---

## AI 配置

首次使用 AI 功能前，请打开 **设置 → AI 设置**，按需填写：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| Base URL | OpenAI 兼容 API 根地址，**不要带** `/chat/completions` | `https://api.openai.com/v1` |
| API Key | 通过 `Authorization: Bearer ...` 发送；本地 Ollama 可留空 | `sk-...` |
| 默认模型 | 新对话默认使用的模型 | `gpt-4o-mini` |
| 模型列表 | 下拉可选的模型，可点「拉取模型」自动从 `/v1/models` 获取 | `gpt-4o-mini, deepseek-chat` |
| System Prompt | 全局系统提示词，对所有新会话生效 | `你是一个严谨的编程助手` |

填写完成后建议点击 **「测试连接」**，会发起一次最小化的 chat 调用以确认配置正确。

> 提示：所有 AI 请求都会在本地日志中记录 `model + base + 消息条数`（不含消息内容、不含 Key），用于在模型表现异常时排查。

---

## 腾讯云 COS 图床

`textmind.cos-upload` 插件让你在 Markdown 标签里直接 `Ctrl+V` 粘贴截图，自动上传到自己的 [腾讯云 COS](https://cloud.tencent.com/product/cos) Bucket 并把 `![alt](url)` 写到光标位置。

配置入口：**设置 → 插件管理... → 腾讯云 COS 图片上传 → 设置**，需要填写：

| 字段 | 说明 |
| --- | --- |
| SecretID / SecretKey | 腾讯云 API 凭证（建议使用子账号 + 最小权限） |
| Region | 例如 `ap-shanghai`、`ap-guangzhou` |
| Bucket | 形如 `my-blog-1250000000` |

凭证以 `0600` 权限保存在 `%AppData%/TextMind/cos-config.json`，不会上传到任何远端。未配置时粘贴图片会给出一次性 Toast 提示，原生粘贴行为不会被破坏。

---

## 插件系统

TextMind 内核只提供窗口、文件 I/O、Tab、编辑器宿主、命令派发与 7 张注册表（commands / menus / sidePanels / modals / statusBar / editors / settings）。所有可见功能都来自插件。

**内置插件列表**：

| ID | 名称 | 主要职责 |
| --- | --- | --- |
| `textmind.files` | Files & Workspace | 文件 / 目录 I/O、最近文件、保存、查找 |
| `textmind.text-tools` | Text Tools | 去重 / 单次 / 重复 / IN 列表 / 提取 / 模板 |
| `textmind.textDiff` | 文本对比 | Monaco DiffEditor 弹窗 |
| `textmind.json` | JSON | 格式化 / 压缩 / 元素数 inlay hint |
| `textmind.ai` | AI | 侧边面板、询问选区、配置 UI |
| `textmind.editor.monaco` | Monaco Editor | 默认编辑器实现 |
| `textmind.editor.markdown` | Markdown WYSIWYG | Milkdown 实现 + Source/WYSIWYG 切换 |
| `textmind.outline` | Markdown 大纲 | 标题侧栏 |
| `textmind.cos-upload` | 腾讯云 COS 图片上传 | Markdown 粘贴图片 → COS |
| `textmind.theme` | Theme | 4 套主题切换 |
| `textmind.shortcuts` | Shortcuts | 快捷键设置 UI |
| `textmind.plugins-ui` | Plugins Manager | 插件管理 UI |
| `textmind.updater` | Updater | 应用内更新 |

**外置插件**：放在 `UserConfigDir/TextMind/plugins/<id>/` 目录下，包含一个 `manifest.json` 和入口脚本即可被发现。完整 API 参见 [`docs/plugin-api.md`](docs/plugin-api.md)，最小示例参见 [`examples/hello-plugin/`](examples/hello-plugin/)。

外置插件通过 `PluginCall` 桥访问后端能力，调用受权限白名单约束；启用 / 禁用 / 卸载都可在「设置 → 插件管理...」里完成，无需重启。

---

## 自动更新

- 启动后约 8 秒会在后台静默检查更新，每 24 小时一次。
- 找到新版本时会弹出更新对话框；可在 **设置 → 检查更新** 中手动触发。
- Windows 平台支持「立即更新」：自动下载新版 `.exe`、原子替换当前文件并重启。
- 其他平台只会提示打开 Release 页面手动下载。
- 更新源固定指向仓库 `jycoast/TextMind`，避免被恶意配置篡改下载地址。

---

## 从源码构建

### 环境要求

- [Go](https://go.dev/dl/) ≥ 1.25
- [Node.js](https://nodejs.org/) ≥ 20（含 npm）
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2.11.0

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
wails doctor
```

### 开发模式（热重载）

```powershell
git clone https://github.com/jycoast/TextMind.git
cd TextMind
wails dev
```

`wails dev` 会同时启动 Vite 前端 dev server 与 Go 后端，并把日志输出到当前终端。

### 仅前端开发

```powershell
cd frontend
npm install
npm run dev          # 启动 Vite，但 Wails 绑定不可用
npm run type-check   # 仅做 TypeScript 类型检查
```

### 生产构建

```powershell
wails build -platform windows/amd64 -clean -trimpath `
  -ldflags "-s -w -X main.Version=v1.0.0"
```

产物位于 `build/bin/TextMind.exe`。`-X main.Version=...` 会把版本号注入到二进制中，供应用内更新模块使用。

---

## 项目结构

```
TextMind/
├── main.go                  # Wails 入口；初始化 pluginhost 并嵌入 frontend/dist
├── app.go                   # 文件 / 会话 / 工具相关 Wails 绑定
├── app_ai.go                # AI 配置 / 会话 / 流式聊天绑定
├── app_cos.go               # 腾讯云 COS 上传绑定
├── app_update.go            # 应用内更新绑定
├── app_plugins.go           # 外置插件发现 / 启用禁用 / PluginCall / 权限管理
├── app_shortcuts.go         # 用户快捷键持久化绑定
├── plugins_builtin.go       # 内置后端模块注册（textops / json / ai / updater / shortcuts）
├── pluginhost/              # 插件宿主：模块注册、PluginCall 桥、权限白名单
├── ai/                      # OpenAI 兼容客户端
├── persist/                 # Session / AI / COS / Keymap 本地持久化
├── extract/  dedupe/ inlist/ # 文本工具核心
├── coscloud/                # 腾讯云 COS SDK 封装
├── update/                  # GitHub Release 拉取与安装
├── textcodec/               # 编码识别 / 转换
├── frontend/
│   ├── src/
│   │   ├── App.vue          # 极薄宿主：TopBar / EditorHost / SidePanels / Modals
│   │   ├── components/      # 编辑器宿主、Tab、BottomBar、复用组件
│   │   ├── composables/     # useMonaco / useSession / useKeyboardShortcuts ...
│   │   ├── stores/          # Pinia 状态（theme / tabs / shortcuts / ui / ...）
│   │   ├── styles/base.css  # 4 套主题 CSS 变量定义
│   │   ├── plugins/
│   │   │   ├── core/        # PluginManager + 7 个注册表 + ModalLayer + EventBus
│   │   │   ├── builtin/     # 13 个内置前端插件（见上表）
│   │   │   ├── external/    # 外置插件动态加载器
│   │   │   └── bootstrap.ts # 启动期注册 + 激活
│   │   └── api/backend.ts   # 对 wailsjs 绑定的封装
│   └── wailsjs/             # `wails generate` 生成的 TS 绑定
├── docs/plugin-api.md       # 插件 API 文档
├── examples/hello-plugin/   # 最小外置插件示例
├── .github/workflows/
└── go.mod / go.sum / wails.json
```

---

## 测试

Go 模块自带单元测试，覆盖文本处理、持久化、AI 客户端、更新模块、编码识别等：

```powershell
go test ./...
```

仅跑某个包：

```powershell
go test ./extract -v
go test ./ai -v
go test ./update -v
go test ./persist -v
```

前端类型检查：

```powershell
cd frontend
npm run type-check
```

---

## 致谢

- [Wails](https://wails.io/) —— Go × Web 桌面应用框架
- [Vue 3](https://vuejs.org/) / [Pinia](https://pinia.vuejs.org/) / [Vite](https://vitejs.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) —— VS Code 同款编辑器内核
- [Milkdown](https://milkdown.dev/) / [ProseMirror](https://prosemirror.net/) —— Markdown 所见即所得引擎
- [Tailwind CSS](https://tailwindcss.com/) / [highlight.js](https://highlightjs.org/) / [markdown-it](https://github.com/markdown-it/markdown-it)
- [腾讯云 COS Go SDK](https://github.com/tencentyun/cos-go-sdk-v5)
- 所有 OpenAI 兼容 API 提供方（OpenAI / DeepSeek / Moonshot / Ollama 等）

---

## License

本项目基于 [MIT License](./LICENSE) 开源，详细条款见仓库根目录的 `LICENSE` 文件。

Copyright (c) 2026 jycoast
