import { defineComponent, h } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import type { Tab } from "@/types";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { createMilkdownAdapter } from "./MilkdownAdapter";
import { createMarkdownSplitAdapter } from "./MarkdownSplitAdapter";
import {
  isMarkdownDocument,
} from "@/composables/markdownDialect";
import {
  editorIdForMode,
  getNextMode,
  MILKDOWN_EDITOR_ID,
  SPLIT_EDITOR_ID,
  supportsWysiwyg,
  type MarkdownEditorMode,
} from "./markdownModes";

const PLUGIN_ID = "textmind.editor.markdown";
function isMarkdownTab(tab: Tab): boolean {
  return isMarkdownDocument(tab);
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
      id: MILKDOWN_EDITOR_ID,
      displayName: "Markdown (WYSIWYG)",
      priority: 10,
      match: (tab) => supportsWysiwyg(tab),
      factory: (host, createCtx) =>
        createMilkdownAdapter({
          host,
          initialTheme: createCtx.initialTheme,
        }),
    });

    ctx.editor.registerEditor({
      id: SPLIT_EDITOR_ID,
      displayName: "Markdown (Source + Preview)",
      priority: -1,
      match: (tab) => isMarkdownTab(tab),
      factory: (host, createCtx) =>
        createMarkdownSplitAdapter({
          host,
          initialTheme: createCtx.initialTheme,
        }),
    });

    const tabs = useTabsStore();
    const ui = useUiStore();

    ctx.commands.register({
      id: "markdown.toggleSourceMode",
      title: "切换 Markdown 富文本 / 分栏 / 源码",
      category: "Markdown",
      bindable: false,
      handler: () => {
        const tab = tabs.current;
        if (!tab) return;
        if (!isMarkdownTab(tab)) {
          ui.showTip("仅 Markdown 文件支持切换");
          return;
        }
        const nextMode = getNextMode(tab);
        tab.editorId = editorIdForMode(nextMode);
        const labels: Record<MarkdownEditorMode, string> = {
          wysiwyg: "富文本",
          split: "源码 + 预览",
          source: "源码",
        };
        ui.showTip(`已切换至${labels[nextMode]}模式`);
      },
    });

    // Status bar button - visible whenever current tab is markdown.
    const ToggleButton = defineComponent({
      name: "MarkdownToggleButton",
      setup() {
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          const nextMode = getNextMode(tab);
          const labels: Record<MarkdownEditorMode, string> = {
            wysiwyg: "WYSIWYG",
            split: "Split",
            source: "Source",
          };
          return h(
            "button",
            {
              class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: {
                borderColor: "var(--hairline)",
                color: "var(--muted)",
              },
              title: "切换 Markdown 富文本 / 分栏 / 源码",
              onClick: () => void ctx.commands.execute("markdown.toggleSourceMode"),
            },
            labels[nextMode],
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
