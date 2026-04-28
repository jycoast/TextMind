# TextMind

> 一个为「批量文本处理 + AI 协作」而生的轻量级 Windows 桌面编辑器。

TextMind 基于 [Wails v2](https://wails.io/)（Go）+ [Vue 3](https://vuejs.org/) + [Monaco Editor](https://microsoft.github.io/monaco-editor/) 构建，把多标签编辑、文件浏览器、常用文本处理工具，以及兼容 OpenAI 协议的 AI 对话/选区改写整合到一个原生应用里。所有数据本地保存，不依赖任何云服务。

---

## 目录

- [核心特性](#核心特性)
- [界面预览](#界面预览)
- [安装与使用](#安装与使用)
- [快捷键](#快捷键)
- [AI 配置](#ai-配置)
- [自动更新](#自动更新)
- [从源码构建](#从源码构建)
- [项目结构](#项目结构)
- [测试](#测试)
- [发布流程](#发布流程)
- [致谢](#致谢)

---

## 核心特性

### 编辑器与会话

- **多标签编辑器**：基于 Monaco，支持语法高亮、Minimap、列编辑、拖拽排序。
- **文件浏览器**：左侧目录树，可打开任意工作区文件夹，文件 / 目录排序、刷新一应俱全。
- **会话自动恢复**：标签页内容、未保存修改、当前工作区、最近文件列表会写入用户配置目录，下次启动原样还原。
- **命令行/拖拽打开**：把文件作为参数传给 `TextMind.exe` 即可在新会话中直接打开。
- **自动识别语言**：根据文件扩展名 + 内容启发式识别，支持手动切换。

### 文本处理工具集（无 AI 也能用）

| 功能                   | 说明                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **去重**               | 对选区按行去重，弹窗显示去掉了多少行                                                                                             |
| **保留单次出现项**     | 仅保留只出现过一次的行，常用于差集对比                                                                                           |
| **转 IN 列表**         | 把多行文本转成 `'a','b','c'` 形式，方便贴进 SQL `IN (...)`                                                                       |
| **提取（Extract）**    | 支持三种模式：<br>· `filter` 按关键字 / 正则保留或反选整行<br>· `capture` 按正则捕获组提取子串<br>· `block` 按起止正则截取多行块 |
| **JSON 格式化 / 压缩** | 选区或全文，解析失败会给出错误位置                                                                                               |
| **模板批量生成**       | 用占位符模板批量产出 SQL / 文本                                                                                                  |
| **列编辑**             | `Ctrl+Alt+L` 开关 Monaco 列选择模式                                                                                              |

### AI 协作

- **AI 侧边面板**（`Ctrl+L` 开关）：完整的多会话聊天界面，支持流式输出、Markdown 渲染、代码高亮、随时取消生成。
- **AI 询问选区**：编辑菜单或右键 → 「AI 询问选区...」，对当前选区做改写 / 翻译 / 解释，结果可：
  - 直接替换选区
  - 插入到光标位置
  - 转入 AI 面板继续追问
- **OpenAI 兼容协议**：可对接 OpenAI、DeepSeek、Moonshot、Azure OpenAI、本地 Ollama 等任何提供 `/v1/chat/completions` 与 `/v1/models` 的服务。
- **多会话管理**：会话标题自动总结、可重命名 / 删除 / 切换模型，全部本地持久化于 `%AppData%/tinyEditor/ai-conversations.json`。
- **API Key 安全存储**：AI 配置文件以 `0600` 权限保存在 `%AppData%/tinyEditor/ai-config.json`，不上传任何服务器。

### 应用集成

- **应用内更新**：定时（24h 一次）静默检查 GitHub Release，发现新版本时弹窗提示。Windows 用户可一键下载并自动重启完成升级。
- **轻量打包**：单个 `.exe`（约 10–20 MB），免安装、绿色运行。

---

## 界面预览

> 截图待补。运行 `wails dev` 即可在本地预览。

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
- 安装有 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 自带；Windows 10 大多数已随 Edge 安装）

---

## 快捷键

| 快捷键         | 功能                        |
| -------------- | --------------------------- |
| `Ctrl+S`       | 保存当前标签                |
| `Ctrl+Shift+G` | 打开模板批量生成            |
| `Ctrl+Alt+L`   | 切换列编辑模式（仅 Monaco） |
| `Ctrl+L`       | 切换 AI 侧边面板            |
| `Esc`          | 关闭顶层弹窗 / 菜单         |

更多 Monaco 自带快捷键（`Ctrl+F` 查找、`Ctrl+H` 替换、`Alt+点击` 多光标等）保持原生行为。

---

## AI 配置

首次使用 AI 功能前，请打开 **设置 → AI 设置**，按需填写：

| 字段          | 说明                                                      | 示例                         |
| ------------- | --------------------------------------------------------- | ---------------------------- |
| Base URL      | OpenAI 兼容 API 根地址，**不要带 `/chat/completions`**    | `https://api.openai.com/v1`  |
| API Key       | 通过 `Authorization: Bearer ...` 发送；本地 Ollama 可留空 | `sk-...`                     |
| 默认模型      | 新对话默认使用的模型                                      | `gpt-4o-mini`                |
| 模型列表      | 下拉可选的模型，可点「拉取模型」自动从 `/v1/models` 获取  | `gpt-4o-mini, deepseek-chat` |
| System Prompt | 全局系统提示词，对所有新会话生效                          | `你是一个严谨的编程助手`     |

填写完成后建议点击 **「测试连接」**，会发起一次最小化的 chat 调用以确认配置正确。

> 提示：所有 AI 请求都会在本地日志中记录 `model + base + 消息条数`（不含消息内容、不含 Key），用于在模型表现异常时排查。

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

产物位于 `build/bin/tinyEditor.exe`。`-X main.Version=...` 会把版本号注入到二进制中，供应用内更新模块使用。

---

## 项目结构

```
TextMind/
├── main.go                  # Wails 入口；嵌入 frontend/dist 静态资源
├── app.go                   # 应用上下文 + 文件 / 会话 / 工具相关 Wails 绑定
├── app_ai.go                # AI 配置 / 会话 / 流式聊天 Wails 绑定
├── app_update.go            # 应用内更新 Wails 绑定
├── ai/                      # OpenAI 兼容客户端（chat 流式 + models）
├── persist/                 # 会话、AI 配置、AI 对话的本地持久化
├── extract/                 # 文本提取核心（filter/capture/block）
├── dedupe/                  # 行去重 / 仅保留单次出现项
├── inlist/                  # 转 SQL IN 列表
├── update/                  # GitHub Release 拉取、下载、Windows 安装器
├── build/                   # Wails 构建模板与图标
├── frontend/
│   ├── src/
│   │   ├── App.vue          # 根组件，串联所有面板与弹窗
│   │   ├── components/      # 编辑器、标签栏、AI 面板、模态框等
│   │   ├── composables/     # useMonaco / useAIChat / useSession 等
│   │   ├── stores/          # Pinia 状态：tabs / workspace / aiChat / update ...
│   │   ├── api/backend.ts   # 对 wailsjs 绑定的封装
│   │   └── assets/          # 图标与样式
│   ├── wailsjs/             # `wails generate` 生成的 TS 绑定（自动维护）
│   ├── package.json
│   └── vite.config.ts
├── .github/workflows/
│   └── release-windows.yml  # 推 tag 自动构建 + 发布 Release
├── go.mod / go.sum
└── wails.json
```

---

## 测试

Go 模块自带单元测试，覆盖文本处理、持久化、AI 客户端、更新模块等：

```powershell
go test ./...
```

仅跑某个包：

```powershell
go test ./extract -v
go test ./ai -v
go test ./update -v
```

---

## 致谢

- [Wails](https://wails.io/) —— Go × Web 桌面应用框架
- [Vue 3](https://vuejs.org/) / [Pinia](https://pinia.vuejs.org/) / [Vite](https://vitejs.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) —— VS Code 同款编辑器内核
- [Tailwind CSS](https://tailwindcss.com/) / [highlight.js](https://highlightjs.org/) / [markdown-it](https://github.com/markdown-it/markdown-it)
- 所有 OpenAI 兼容 API 提供方（OpenAI / DeepSeek / Moonshot / Ollama 等）

---

## License

本仓库目前未声明许可证，默认遵循「保留所有权利」。如需在你的项目中使用代码，请先与作者联系。
