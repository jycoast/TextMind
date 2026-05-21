// Minimal TextMind external plugin.
//
// Drop this folder (plugin.json + index.js) into:
//   Windows: %AppData%/TextMind/plugins/hello-plugin/
//   macOS:   ~/Library/Application Support/TextMind/plugins/hello-plugin/
//   Linux:   ~/.config/TextMind/plugins/hello-plugin/
//
// Restart TextMind. You should see "Hello" in the Settings menu and a "Hi"
// button at the top-right of the title bar.

const manifest = {
  id: "examples.hello-plugin",
  name: "Hello Plugin",
  version: "0.1.0",
  builtin: false,
  activationEvents: ["onStartup"],
};

// External plugins talk to the host through globalThis.TextMind (curated by
// the loader). We intentionally avoid bare ESM specifiers so the plugin runs
// against the embedded Wails build without a virtual module registry.
const host = (globalThis.TextMind = globalThis.TextMind || {});

const plugin = {
  manifest,
  async activate(ctx) {
    ctx.commands.register({
      id: "hello.greet",
      title: "Hello: 打个招呼",
      category: "Hello",
      handler: () => {
        ctx.ui.showCenterNotice("Hello from external plugin!");
      },
    });

    ctx.menus.registerItem({
      id: "hello.menu.greet",
      menu: "topbar.settings",
      group: "z-examples",
      order: 999,
      separatorBefore: true,
      label: "Hello: 打个招呼",
      commandId: "hello.greet",
    });

    // Status bar button (uses Vue's defineComponent indirectly via the
    // host - we keep this example dep-free by returning a render fn).
    const StatusButton = {
      name: "HelloStatusButton",
      render() {
        return host.h
          ? host.h(
              "button",
              {
                class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
                style: { color: "var(--muted)", borderColor: "var(--hairline)" },
                onClick: () => ctx.commands.execute("hello.greet"),
                title: "Hello plugin",
              },
              "Hi",
            )
          : null;
      },
    };

    ctx.statusBar.register({
      id: "hello.status",
      align: "right",
      order: 200,
      component: StatusButton,
    });
  },
};

export default plugin;
