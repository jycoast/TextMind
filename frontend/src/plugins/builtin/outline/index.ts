import type { Plugin, PluginContext } from "@/plugins/core";
import { useSidebarStore } from "@/stores/sidebar";
import OutlinePanel from "./OutlinePanel.vue";
import { PLUGIN_ID } from "./shared";

export const outlinePlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Markdown 大纲",
    version: "1.0.0",
    builtin: true,
    description: "在左侧侧边栏展示当前 Markdown 文件的标题大纲，可点击跳转。",
  },
  async activate(ctx: PluginContext) {
    const sidebar = useSidebarStore();

    sidebar.register({
      id: "outline",
      icon: "outline",
      title: "大纲",
      order: 30,
      component: OutlinePanel,
    });

    ctx.commands.register({
      id: "outline.toggle",
      title: "切换文档大纲面板",
      category: "视图",
      defaultKeybinding: "Ctrl+Shift+O",
      handler: () => {
        sidebar.toggle("outline");
      },
    });
  },
};
