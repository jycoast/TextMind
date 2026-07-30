import { defineComponent, h } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import type { Tab } from "@/types";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { backend } from "@/api/backend";
import { prepareMarkdownPDF } from "@/composables/markdownExport";
import { createMilkdownAdapter } from "./MilkdownAdapter";
import { createMarkdownSplitAdapter } from "./MarkdownSplitAdapter";
import {
  analyzeWysiwygCompatibility,
  isMarkdownDocument,
} from "@/composables/markdownDialect";
import {
  editorIdForMode,
  getCurrentMode,
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
          documentPath: createCtx.tab?.path || "",
          onExportPdf: async () => {
            await ctx.commands.execute("markdown.exportPdf");
          },
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
          documentPath: createCtx.tab?.path || "",
        }),
    });

    const tabs = useTabsStore();
    const ui = useUiStore();

    ctx.commands.register({
      id: "markdown.exportPdf",
      title: "导出 Markdown 为 PDF...",
      category: "Markdown",
      handler: async () => {
        const tab = tabs.current;
        if (!tab || !isMarkdownTab(tab)) {
          ui.showTip("仅 Markdown 文件支持导出 PDF");
          return;
        }
        tabs.persistCurrentText();
        ui.showTip("正在准备 PDF...");
        try {
          const prepared = await prepareMarkdownPDF(
            tab.text || "",
            tab.title || "Markdown",
            tab.path || "",
          );
          if (prepared.missingLocalImages > 0) {
            ui.showTip(`有 ${prepared.missingLocalImages} 张本地图片无法加载，请修复路径后重试`);
            return;
          }
          const result = await backend.exportMarkdownPDF(
            tab.title || "document.md",
            prepared.html,
          );
          if (result.error) {
            ui.showTip(result.error);
          } else if (result.path) {
            const mermaidTip = prepared.mermaidErrors > 0
              ? `；${prepared.mermaidErrors} 个 Mermaid 图表存在语法错误`
              : "";
            ui.showTip(`已导出 PDF：${result.name || result.path}${mermaidTip}`);
          }
        } catch (error) {
          ui.showTip(error instanceof Error ? error.message : "导出 PDF 失败");
        }
      },
    });

    ctx.commands.register({
      id: "markdown.toggleSourceMode",
      title: "切换 Markdown 所见即所得 / 分栏 / 源码",
      category: "Markdown",
      bindable: false,
      handler: () => {
        // Compatibility must be checked against the editor's current value,
        // not the potentially debounced tab snapshot. Otherwise rapidly
        // typing unsupported syntax and immediately switching modes can send
        // stale "safe" Markdown into Milkdown and normalize content silently.
        tabs.persistCurrentText();
        const tab = tabs.current;
        if (!tab) return;
        if (!isMarkdownTab(tab)) {
          ui.showTip("仅 Markdown 文件支持切换");
          return;
        }
        const nextMode = getNextMode(tab);
        tab.editorId = editorIdForMode(nextMode);
        const labels: Record<MarkdownEditorMode, string> = {
          wysiwyg: "所见即所得",
          split: "源码 + 预览",
          source: "源码",
        };
        const compatibility = analyzeWysiwygCompatibility(tab);
        const suffix = compatibility.message ? `；${compatibility.message}` : "";
        ui.showTip(`已切换至${labels[nextMode]}模式${suffix}`);
      },
    });

    // Status bar button - visible whenever current tab is markdown.
    const ToggleButton = defineComponent({
      name: "MarkdownToggleButton",
      setup() {
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          const currentMode = getCurrentMode(tab);
          const nextMode = getNextMode(tab);
          const compatibility = analyzeWysiwygCompatibility(tab);
          const labels: Record<MarkdownEditorMode, string> = {
            wysiwyg: "所见即所得",
            split: "分栏",
            source: "源码",
          };
          return h(
            "button",
            {
              class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: {
                borderColor: "var(--hairline)",
                color: "var(--muted)",
              },
              title: compatibility.compatible
                ? `当前：${labels[currentMode]}；点击切换至 ${labels[nextMode]}`
                : `当前：${labels[currentMode]}；${compatibility.message}；点击切换至 ${labels[nextMode]}`,
              onClick: () => void ctx.commands.execute("markdown.toggleSourceMode"),
            },
            labels[currentMode],
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
