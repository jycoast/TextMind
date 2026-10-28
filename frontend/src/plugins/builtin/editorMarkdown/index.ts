import { defineComponent, h, onMounted, ref, watch, watchEffect } from "vue";
import type {
  Plugin,
  PluginContext,
  SubmenuItem,
} from "@/plugins/core";
import type { Tab } from "@/types";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import {
  useReadingWidth,
  type ReadingWidth,
} from "@/composables/useReadingWidth";
import { analyzeMarkdownQuality } from "@/composables/markdownQuality";
import {
  useFocusMode,
  type FocusMode,
} from "@/composables/useFocusMode";
import { backend } from "@/api/backend";
import {
  prepareMarkdownHTML,
  prepareMarkdownPDF,
} from "@/composables/markdownExport";
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
          onExportHtml: async () => {
            await ctx.commands.execute("markdown.exportHtml");
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
      id: "markdown.exportHtml",
      title: "导出 Markdown 为 HTML...",
      category: "Markdown",
      handler: async () => {
        const tab = tabs.current;
        if (!tab || !isMarkdownTab(tab)) {
          ui.showTip("仅 Markdown 文件支持导出 HTML");
          return;
        }
        tabs.persistCurrentText();
        ui.showTip("正在准备 HTML...");
        try {
          const prepared = await prepareMarkdownHTML(
            tab.text || "",
            tab.title || "Markdown",
            tab.path || "",
          );
          if (prepared.missingLocalImages > 0) {
            ui.showTip(`有 ${prepared.missingLocalImages} 张本地图片无法加载，请修复路径后重试`);
            return;
          }
          const result = await backend.saveTextFileAs(
            `${(tab.title || "document").replace(/\.md$/i, "")}.html`,
            prepared.html,
          );
          if (result.error) {
            ui.showTip(result.error);
          } else if (result.path) {
            const mermaidTip = prepared.mermaidErrors > 0
              ? `；${prepared.mermaidErrors} 个 Mermaid 图表存在语法错误`
              : "";
            ui.showTip(`已导出 HTML：${result.name || result.path}${mermaidTip}`);
          }
        } catch (error) {
          ui.showTip(error instanceof Error ? error.message : "导出 HTML 失败");
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

    // --- Markdown block context-menu ---
    ctx.commands.register({
      id: "markdown.format",
      title: "Markdown 格式操作",
      category: "Markdown",
      handler: async (...args: unknown[]) => {
        const [action, payload] = args as [string, unknown?];
        const tab = tabs.current;
        if (!tab || !isMarkdownTab(tab)) return;
        tabs.adapter?.runFormatting?.(action, payload);
      },
    });
    ctx.commands.register({
      id: "markdown.code.copy",
      title: "复制代码块",
      category: "Markdown",
      handler: async () => {
        const tab = tabs.current;
        if (!tab || !isMarkdownTab(tab)) return;
        const block = tabs.adapter?.getContextBlock?.();
        if (!block?.inCodeBlock || !block.codeText) return;
        try {
          await navigator.clipboard.writeText(block.codeText);
          ui.showTip("已复制代码");
        } catch {
          ui.showTip("复制失败");
        }
      },
    });

    // Right-click a block shows the operations that make sense for it: table
    // row/column/align/delete when inside a table, copy-code inside a code
    // block, and a task-status toggle on a task item. Hidden for plain text.
    ctx.menus.registerItem({
      id: "ctx.markdown.block",
      menu: "editor.context",
      group: "md",
      order: 5,
      label: "Markdown",
      visible: () => {
        const tab = tabs.current;
        if (!tab || !isMarkdownTab(tab)) return false;
        const block = tabs.adapter?.getContextBlock?.();
        return Boolean(
          block && (block.inTable || block.inCodeBlock || block.inListItem),
        );
      },
      submenuProvider: (): SubmenuItem[] => {
        const block = tabs.adapter?.getContextBlock?.();
        if (!block) return [];
        const items: SubmenuItem[] = [];
        if (block.inTable) {
          items.push(
            { id: "md.table.row-before", label: "在上方插入行", commandId: "markdown.format", commandArgs: ["table-add-row-before"] },
            { id: "md.table.row-after", label: "在下方插入行", commandId: "markdown.format", commandArgs: ["table-add-row-after"] },
            { id: "md.table.col-before", label: "在左侧插入列", commandId: "markdown.format", commandArgs: ["table-add-column-before"] },
            { id: "md.table.col-after", label: "在右侧插入列", commandId: "markdown.format", commandArgs: ["table-add-column-after"] },
            { id: "md.table.align-left", label: "左对齐", commandId: "markdown.format", commandArgs: ["table-align", "left"] },
            { id: "md.table.align-center", label: "居中对齐", commandId: "markdown.format", commandArgs: ["table-align", "center"] },
            { id: "md.table.align-right", label: "右对齐", commandId: "markdown.format", commandArgs: ["table-align", "right"] },
            { id: "md.table.del-row", label: "删除当前行", commandId: "markdown.format", commandArgs: ["table-delete-row"] },
            { id: "md.table.del-col", label: "删除当前列", commandId: "markdown.format", commandArgs: ["table-delete-column"] },
            { id: "md.table.del", label: "删除表格", commandId: "markdown.format", commandArgs: ["table-delete"] },
          );
        } else {
          items.push({
            id: "md.table.insert",
            label: "插入 3 x 3 表格",
            commandId: "markdown.format",
            commandArgs: ["table-insert"],
          });
        }
        if (block.inCodeBlock) {
          items.push({ id: "md.code.copy", label: "复制代码", commandId: "markdown.code.copy" });
        }
        if (block.isTaskItem) {
          items.push({ id: "md.task.toggle", label: "切换任务状态", commandId: "markdown.format", commandArgs: ["task-list"] });
        }
        return items;
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

    // Reading-width toggle for the Markdown preview content column.
    const widthLabels: Record<ReadingWidth, string> = {
      narrow: "窄",
      standard: "标准",
      wide: "宽",
    };
    const ReadingWidthButton = defineComponent({
      name: "MarkdownReadingWidthButton",
      setup() {
        const { width, cycle } = useReadingWidth();
        const apply = (): void => {
          document.body.dataset.readingWidth = width.value;
        };
        apply();
        onMounted(apply);
        watch(width, apply);
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          return h(
            "button",
            {
              class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: { borderColor: "var(--hairline)", color: "var(--muted)" },
              title: `阅读宽度：${widthLabels[width.value]}；点击切换`,
              onClick: () => {
                cycle();
              },
            },
            widthLabels[width.value],
          );
        };
      },
    });
    ctx.statusBar.register({
      id: "markdown.reading-width",
      align: "right",
      order: 60,
      component: ReadingWidthButton,
    });

    // Live word count + estimated reading time for the current Markdown tab.
    const WordCount = defineComponent({
      name: "MarkdownWordCount",
      setup() {
        const stats = ref({ word: 0, minutes: 0 });
        watchEffect(() => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) {
            stats.value = { word: 0, minutes: 0 };
            return;
          }
          const report = analyzeMarkdownQuality(tab.text || "");
          stats.value = { word: report.wordCount, minutes: report.readingMinutes };
        });
        return () => {
          if (!tabs.current || !isMarkdownTab(tabs.current)) return null;
          return h(
            "span",
            {
              class: "h-5 px-2 text-[12px] leading-[20px] whitespace-nowrap",
              style: { color: "var(--muted)" },
              title: `字数统计（不含代码/数学）与预计阅读时间`,
            },
            `${stats.value.word.toLocaleString()} 字 · ${stats.value.minutes} 分钟`,
          );
        };
      },
    });
    ctx.statusBar.register({
      id: "markdown.word-count",
      align: "right",
      order: 70,
      component: WordCount,
    });

    // Typewriter / focus mode toggle.
    const focusLabels: Record<FocusMode, string> = {
      off: "标准",
      typewriter: "打字机",
      focus: "专注",
      both: "打字机+专注",
    };
    const FocusModeButton = defineComponent({
      name: "MarkdownFocusModeButton",
      setup() {
        const { mode, cycle } = useFocusMode();
        return () => {
          const tab = tabs.current;
          if (!tab || !isMarkdownTab(tab)) return null;
          return h(
            "button",
            {
              class: "h-5 px-2 text-[12px] cursor-pointer rounded-sm border bg-transparent",
              style: { borderColor: "var(--hairline)", color: "var(--muted)" },
              title: `编辑模式：${focusLabels[mode.value]}；点击切换`,
              onClick: () => {
                cycle();
              },
            },
            focusLabels[mode.value],
          );
        };
      },
    });
    ctx.statusBar.register({
      id: "markdown.focus-mode",
      align: "right",
      order: 65,
      component: FocusModeButton,
    });
  },
};
