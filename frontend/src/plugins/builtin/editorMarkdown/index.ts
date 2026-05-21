import { defineComponent, h } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import type { Tab } from "@/types";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { createMilkdownAdapter } from "./MilkdownAdapter";

const PLUGIN_ID = "textmind.editor.markdown";
const EDITOR_ID = "milkdown";

function isMarkdownTab(tab: Tab): boolean {
  if (tab.language === "markdown" || tab.language === "md") return true;
  const path = (tab.path || tab.title || "").toLowerCase();
  return /\.(md|markdown|mdx)$/.test(path);
}

export const editorMarkdownPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Markdown WYSIWYG",
    version: "1.0.0",
    builtin: true,
    description: "Typora-style markdown editor powered by Milkdown.",
  },
  async activate(ctx: PluginContext) {
    ctx.editor.registerEditor({
      id: EDITOR_ID,
      displayName: "Markdown (WYSIWYG)",
      priority: 10,
      match: (tab) => isMarkdownTab(tab),
      factory: (host, createCtx) =>
        createMilkdownAdapter({
          host,
          initialTheme: createCtx.initialTheme,
        }),
    });

    const tabs = useTabsStore();
    const ui = useUiStore();

    ctx.commands.register({
      id: "markdown.toggleSourceMode",
      title: "切换 Markdown 源码 / 富文本",
      category: "Markdown",
      bindable: false,
      handler: () => {
        const tab = tabs.current;
        if (!tab) return;
        if (!isMarkdownTab(tab)) {
          ui.showTip("仅 Markdown 文件支持切换");
          return;
        }
        const nextEditor = tab.editorId === "monaco" ? "milkdown" : "monaco";
        tab.editorId = nextEditor;
        ui.showTip(
          nextEditor === "monaco" ? "已切换至源码模式" : "已切换至富文本模式",
        );
      },
    });

    // Status bar button - visible whenever current tab is markdown.
    const ToggleButton = defineComponent({
      name: "MarkdownToggleButton",
      setup() {
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          const inSource = tab.editorId === "monaco";
          return h(
            "button",
            {
              class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: {
                borderColor: "var(--hairline)",
                color: "var(--muted)",
              },
              title: "切换 Markdown 源码 / 富文本",
              onClick: () => void ctx.commands.execute("markdown.toggleSourceMode"),
            },
            inSource ? "WYSIWYG" : "Source",
          );
        };
      },
    });

    ctx.statusBar.register({
      id: "markdown.toggle",
      align: "right",
      order: 50,
      component: ToggleButton,
    });
  },
};
