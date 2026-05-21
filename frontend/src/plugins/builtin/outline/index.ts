import { defineComponent, h } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import OutlinePanel from "./OutlinePanel.vue";
import { PANEL_ID, PLUGIN_ID, isMarkdownTab } from "./shared";

export const outlinePlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Markdown 大纲",
    version: "1.0.0",
    builtin: true,
    description: "在左侧侧边栏展示当前 Markdown 文件的标题大纲，可点击跳转。",
  },
  async activate(ctx: PluginContext) {
    const tabs = useTabsStore();

    ctx.sidePanels.register({
      id: PANEL_ID,
      title: "大纲",
      position: "left",
      defaultWidth: 220,
      component: OutlinePanel,
    });

    ctx.commands.register({
      id: "outline.toggle",
      title: "切换文档大纲面板",
      category: "视图",
      defaultKeybinding: "Ctrl+Shift+O",
      handler: () => {
        ctx.sidePanels.toggle(PANEL_ID);
      },
    });

    ctx.menus.registerItem({
      id: "settings.menu.outline",
      menu: "topbar.settings",
      group: "a",
      order: 5,
      label: "文档大纲",
      commandId: "outline.toggle",
    });

    // Status bar entry visible only on markdown tabs; clicking toggles the
    // panel and reflects whether the panel is currently open.
    const OutlineToggleButton = defineComponent({
      name: "OutlineToggleButton",
      setup() {
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          const visible = ctx.sidePanels.isVisible(PANEL_ID);
          return h(
            "button",
            {
              class:
                "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: {
                borderColor: "var(--hairline)",
                color: visible ? "var(--accent)" : "var(--muted)",
              },
              title: "切换文档大纲 (Ctrl+Shift+O)",
              onClick: () => void ctx.commands.execute("outline.toggle"),
            },
            "大纲",
          );
        };
      },
    });

    ctx.statusBar.register({
      id: "outline.toggle",
      align: "right",
      order: 40,
      component: OutlineToggleButton,
    });
  },
};
