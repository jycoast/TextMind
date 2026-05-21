# TextMind Plugin API

TextMind 采用「内核 + 贡献点」的插件架构：核心仅负责窗口、文件 I/O、Tab、编辑器宿主、命令派发、菜单/侧边/状态栏/设置注册表。其他功能（AI、JSON、文本工具、Markdown 富文本…）全部以**插件**形式接入。

本文档面向插件作者，讲清楚 manifest、Plugin、PluginContext、注册表、宿主-后端桥的契约。

## 1. 插件加载位置

- **内置插件**：`frontend/src/plugins/builtin/<id>/`，静态编入主程序。
- **外置插件**：`%AppData%/TextMind/plugins/<plugin-id>/`（Windows）或对应平台目录。每个插件目录至少包含 `plugin.json` 和入口 ESM 脚本（默认 `index.js`）。

启动顺序：
1. 注册全部内置插件 → `fire('onStartup')`。
2. 异步调用 `discoverAndLoadExternalPlugins()`，依次校验、动态 import、激活。
3. 一个插件加载失败不会影响其他插件。

## 2. Manifest

```json
{
  "id": "com.acme.hello",
  "name": "Hello",
  "version": "0.1.0",
  "description": "Says hi from the editor",
  "entry": "index.js",
  "activationEvents": ["onStartup"],
  "permissions": ["ai.chat"]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一，反向域名风格 |
| `name` | 是 | 展示名 |
| `version` | 是 | semver |
| `entry` | 否 | ESM 入口相对路径，默认 `index.js` |
| `activationEvents` | 否 | 触发激活的事件，目前支持 `onStartup`、`onCommand:<id>`、`onLanguage:<id>`、`onFileExtension:<ext>` |
| `permissions` | 否 | 期望授予的权限标签，宿主桥按方法粒度校验 |
| `description` / `author` | 否 | 元信息 |

## 3. Plugin 与 PluginContext

```ts
export interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
```

`activate(ctx)` 在激活时调用一次。所有通过 `ctx.*.register*()` 注册的内容都会返回 `Disposable`，宿主会在 `deactivate()`（或卸载插件时）依次 `dispose()`。

### PluginContext 核心 API

| 命名空间 | 关键方法 |
|----------|----------|
| `commands` | `register({ id, title, category, defaultKeybinding, handler })` / `execute(id, ...args)` / `has(id)` |
| `keybindings` | `bindDefault(commandId, combo)` |
| `menus` | `registerTopMenu({ id, label, order })` / `registerItem({ menu, label, commandId, group, order, separatorBefore })` |
| `editor` | `registerEditor({ id, match(tab), priority, factory })` / `getActiveAdapter()` / `getActiveTab()` / `onEditorAttached(handler)` |
| `sidePanels` | `register({ id, title, position, defaultWidth, component })` / `setVisible(id, v)` / `toggle(id)` |
| `statusBar` | `register({ id, align, order, component })` |
| `settings` | `registerPage({ id, title, order, component })` |
| `ui` | `openModal({ id, component, props, onClose })` / `closeModal(id)` / `showTip(msg)` / `showCenterNotice(msg)` |
| `storage` | `namespace()` — 返回插件作用域字符串，配合 `localStorage` 使用 |
| `events` | `on(event, handler)` / `emit(event, ...args)` |
| `backend` | 内置插件可直接使用全部 Wails 绑定；外置插件应改走 `pluginCall()` |

### 菜单标识

宿主预置以下菜单 id：
- `topbar.file` / `topbar.edit` / `topbar.settings`
- `editor.context` — 编辑器右键
- `tab.context` — Tab 右键

## 4. 命令、快捷键、菜单的关系

```
commands.register({ id: 'json.format', title: '格式化 JSON', handler })
menus.registerItem({ menu: 'editor.context', commandId: 'json.format' })
keybindings.bindDefault('json.format', 'Ctrl+Alt+J')
```

`shortcuts` 插件会自动从 `CommandRegistry.listBindable()` 拉取列表，渲染快捷键设置弹窗。任何插件都不需要去修改 `ACTION_META`（已删除）。

## 5. EditorAdapter 协议

新编辑器只要实现 `frontend/src/types/index.ts` 的 `EditorAdapter` 并向 `ctx.editor.registerEditor` 注册即可。`pickFor(tab)` 按 `tab.editorId` 覆盖 + `match()` + `priority` 选最优。`tab.viewState` 是 `Record<editorId, unknown>`，每个适配器只负责自己的 key。

参考实现：
- `plugins/builtin/editorMonaco/` — 默认源码编辑器（priority 0，match → true）
- `plugins/builtin/editorMarkdown/MilkdownAdapter.ts` — Markdown 富文本（priority 10，仅 `.md/.markdown/.mdx`）

## 6. 后端桥（PluginCall）

外置插件**不能**访问 `window.go.*`。要调用后端能力，走 `backend.pluginCall(pluginId, method, payloadJson)`：

```ts
const res = await backend.pluginCall(
  'com.acme.hello',
  'ai.fetchModels',
  JSON.stringify({ baseUrl: '...' }),
);
if (res.ok) { /* use res.result */ }
```

宿主侧：
- `pluginhost.Bridge.RegisterMethod(id, handler, requiredPerms...)`
- `pluginhost.Bridge.Grant(pluginId, ...tags)` — Plugins 设置页确认后调用

内置插件默认通过 `Bridge.Trust(pluginId)` 跳过权限校验。

## 7. 沙箱与权限

| 权限标签 | 范围 |
|----------|------|
| `fs.read` | 读用户文件 |
| `fs.write` | 写用户文件 |
| `ai.chat` | 调用 AI 流式接口 |
| `net.fetch:<host>` | 访问指定主机 |

权限粒度可由插件 manifest 中的 `permissions` 字段声明，安装/启用时由 Plugins 管理面板向用户确认。

## 8. 完整示例

见 `examples/hello-plugin/`。

## 9. 反激活 / 卸载

- `deactivate()` 由宿主在卸载或重启前调用。
- 所有通过 ctx 注册的菜单、命令、面板会自动被 dispose。
- 插件自己开的 `setInterval`、`addEventListener` 需要在 `deactivate` 里清理。

## 10. 调试技巧

- 加载失败的插件会出现在「设置 → 插件管理」列表里，并显示 `error` 字段。
- 控制台 `[plugins] ...` 日志记录加载、激活、桥调用错误。
- 修改外置插件后只需重启 TextMind，无需重新打包。
