import { createMonacoAdapter } from "@/composables/useMonaco";
import { renderMarkdown } from "@/composables/useMarkdown";
import { renderMermaidElements } from "@/composables/useMermaid";
import { handleMarkdownLinkClick } from "@/composables/markdownLinks";
import type { EditorAdapter } from "@/types";

export interface MarkdownSplitAdapterOptions {
  host: HTMLElement;
  initialTheme: string;
}

interface SplitViewState {
  source: unknown;
  previewScrollTop: number;
}

export function createMarkdownSplitAdapter(
  options: MarkdownSplitAdapterOptions,
): EditorAdapter {
  const { host, initialTheme } = options;
  const root = document.createElement("div");
  root.className = "tm-md-split";
  const sourceHost = document.createElement("div");
  sourceHost.className = "tm-md-split__source";
  const preview = document.createElement("article");
  preview.className = "tm-md-split__preview tm-markdown-preview";
  preview.setAttribute("aria-label", "Markdown preview");
  root.append(sourceHost, preview);
  host.appendChild(root);

  const source = createMonacoAdapter({ host: sourceHost, initialTheme });
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function renderPreview(): void {
    if (disposed) return;
    preview.innerHTML = renderMarkdown(source.getValue());
    void renderMermaidElements(preview);
  }

  function schedulePreview(): void {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      renderPreview();
    }, 120);
  }

  source.onChange(schedulePreview);
  preview.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) {
      handleMarkdownLinkClick(event);
      return;
    }
    const id = decodeURIComponent(link.hash.slice(1));
    const destination = preview.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!destination) return;
    event.preventDefault();
    destination.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  return {
    id: "markdown-split",
    mode: "monaco",
    supportsColumnMode: source.supportsColumnMode,
    getValue: source.getValue,
    setValue(value) {
      source.setValue(value);
      schedulePreview();
    },
    getViewState: (): SplitViewState => ({
      source: source.getViewState(),
      previewScrollTop: preview.scrollTop,
    }),
    setViewState(value) {
      const state = value as Partial<SplitViewState> | null;
      if (!state) return;
      source.setViewState("source" in state ? state.source : value);
      preview.scrollTop = Math.max(0, state.previewScrollTop || 0);
    },
    setLanguage: source.setLanguage,
    setTheme(themeName) {
      source.setTheme(themeName);
      renderPreview();
    },
    getSelectionText: source.getSelectionText,
    replaceSelection: source.replaceSelection,
    setColumnMode: source.setColumnMode,
    focus: source.focus,
    onChange: source.onChange,
    onContextMenu: source.onContextMenu,
    onSelectionsChange: source.onSelectionsChange,
    getCursorPosition: source.getCursorPosition,
    getSelectionStats: source.getSelectionStats,
    onCursorChange: source.onCursorChange,
    forceRefresh() {
      source.forceRefresh();
      renderPreview();
    },
    triggerFind: source.triggerFind,
    onPaste: source.onPaste,
    insertText: source.insertText,
    revealLine: source.revealLine,
    dispose() {
      disposed = true;
      if (previewTimer) clearTimeout(previewTimer);
      source.dispose();
      root.remove();
    },
  };
}
