# hello-plugin

最小可运行的 TextMind 外置插件示例。

## 安装

把整个 `hello-plugin/` 目录复制到平台对应的插件目录：

| 平台 | 目录 |
|------|------|
| Windows | `%AppData%\TextMind\plugins\hello-plugin\` |
| macOS | `~/Library/Application Support/TextMind/plugins/hello-plugin/` |
| Linux | `~/.config/TextMind/plugins/hello-plugin/` |

重启 TextMind。

## 验证

- 设置菜单底部出现 "Hello: 打个招呼"。
- 顶栏右侧出现 "Hi" 按钮。点击会在编辑器中央闪一条 "Hello from external plugin!" 通知。

## 工作原理

详见 [`docs/plugin-api.md`](../../docs/plugin-api.md)。核心点：

1. `plugin.json` 描述 manifest（id、版本、入口、激活事件、权限）。
2. `index.js` 默认导出 `{ manifest, activate(ctx) }`。
3. `ctx` 暴露 `commands` / `menus` / `statusBar` / `ui` 等注册表。
4. 所有注册返回 `Disposable`，宿主在卸载时自动回收。

## 限制

- 外置插件无法访问 `window.go.*`；要调用后端，使用 `backend.pluginCall(...)`，并在 manifest 中声明 `permissions`。
- 通过 `globalThis.TextMind` 获取宿主能力（Vue h 等）。
