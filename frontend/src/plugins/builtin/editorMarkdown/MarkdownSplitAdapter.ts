import { createMonacoAdapter } from "@/composables/useMonaco";
import { renderDocumentMarkdown } from "@/composables/useMarkdown";
import { renderMermaidElements } from "@/composables/useMermaid";
import {
  handleDocumentMarkdownLinkClick,
  hydrateLocalMarkdownImages,
} from "@/composables/markdownResources";
import type { EditorAdapter } from "@/types";

export interface MarkdownSplitAdapterOptions {
  host: HTMLElement;
  initialTheme: string;
  documentPath?: string;
}

interface SplitViewState {
  source: unknown;
  previewScrollTop: number;
  paneRatio: number;
}

export function createMarkdownSplitAdapter(
  options: MarkdownSplitAdapterOptions,
): EditorAdapter {
  const { host, initialTheme, documentPath = "" } = options;
  const root = document.createElement("div");
  root.className = "tm-md-split";
  const sourceHost = document.createElement("div");
  sourceHost.className = "tm-md-split__source";
  const divider = document.createElement("div");
  divider.className = "tm-md-split__divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "调整 Markdown 源码与预览宽度");
  divider.setAttribute("aria-orientation", "vertical");
  divider.setAttribute("aria-valuemin", "20");
  divider.setAttribute("aria-valuemax", "80");
  divider.tabIndex = 0;
  const preview = document.createElement("article");
  preview.className = "tm-md-split__preview tm-markdown-preview";
  preview.setAttribute("aria-label", "Markdown preview");
  root.append(sourceHost, divider, preview);
  host.appendChild(root);

  const source = createMonacoAdapter({ host: sourceHost, initialTheme });
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let paneRatio = 0.5;
  let syncingScroll = false;
  let layoutFrame: number | null = null;
  let renderGeneration = 0;
  const mermaidRenderLimit = 300_000;

  function setPaneRatio(value: number): void {
    paneRatio = Math.min(0.8, Math.max(0.2, value));
    root.style.setProperty("--tm-md-source-width", `${paneRatio * 100}%`);
    divider.setAttribute("aria-valuenow", String(Math.round(paneRatio * 100)));
    if (layoutFrame === null) {
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        source.forceRefresh();
      });
    }
  }

  function syncGuarded(operation: () => void): void {
    if (syncingScroll) return;
    syncingScroll = true;
    operation();
    queueMicrotask(() => {
      syncingScroll = false;
    });
  }

  function sourceAnchors(): HTMLElement[] {
    return Array.from(preview.querySelectorAll<HTMLElement>("[data-source-line]"));
  }

  function revealPreviewLine(line: number): void {
    const anchors = sourceAnchors();
    if (anchors.length === 0) return;
    let target = anchors[0];
    for (const anchor of anchors) {
      const sourceLine = Number(anchor.dataset.sourceLine || 0);
      if (sourceLine > line) break;
      target = anchor;
    }
    for (const anchor of anchors) {
      anchor.classList.toggle("tm-md-source-active", anchor === target);
    }
    const previewRect = preview.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = preview.scrollTop + targetRect.top - previewRect.top - 16;
    syncGuarded(() => preview.scrollTo({ top: Math.max(0, top), behavior: "smooth" }));
  }

  source.onCursorChange(() => {
    revealPreviewLine(source.getCursorPosition().line);
  });

  source.onScroll?.((progress) => {
    syncGuarded(() => {
      const max = Math.max(0, preview.scrollHeight - preview.clientHeight);
      preview.scrollTop = progress * max;
    });
  });
  preview.addEventListener("scroll", () => {
    if (!source.setScrollProgress) return;
    syncGuarded(() => {
      const max = Math.max(0, preview.scrollHeight - preview.clientHeight);
      source.setScrollProgress?.(max > 0 ? preview.scrollTop / max : 0);
    });
  });

  let resizing = false;
  const onResizeMove = (event: PointerEvent) => {
    if (!resizing) return;
    const rect = root.getBoundingClientRect();
    if (rect.width > 0) setPaneRatio((event.clientX - rect.left) / rect.width);
  };
  const stopResize = () => {
    if (!resizing) return;
    resizing = false;
    divider.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", stopResize);
  };
  divider.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resizing = true;
    divider.classList.add("is-dragging");
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", stopResize);
  });
  divider.addEventListener("dblclick", () => setPaneRatio(0.5));
  divider.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setPaneRatio(paneRatio + (event.key === "ArrowRight" ? 0.05 : -0.05));
  });

  function renderPreview(): void {
    if (disposed) return;
    const markdown = source.getValue();
    const generation = ++renderGeneration;
    preview.innerHTML = renderDocumentMarkdown(markdown);
    void hydrateLocalMarkdownImages(preview, documentPath).then(() => {
      if (disposed || generation !== renderGeneration) return;
    });
    if (markdown.length <= mermaidRenderLimit) {
      void renderMermaidElements(preview);
    } else if (preview.querySelector(".mermaid")) {
      const notice = document.createElement("div");
      notice.className = "tm-md-preview-notice";
      notice.textContent = "文档较大，已暂停 Mermaid 实时渲染以保持编辑流畅";
      preview.prepend(notice);
    }
    requestAnimationFrame(() => {
      if (!disposed && generation === renderGeneration) {
        revealPreviewLine(source.getCursorPosition().line);
      }
    });
  }

  function schedulePreview(): void {
    if (previewTimer) clearTimeout(previewTimer);
    const delay = source.getValue().length > 300_000 ? 350 : 120;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      renderPreview();
    }, delay);
  }

  source.onChange(schedulePreview);
  preview.addEventListener("click", (event) => {
    handleDocumentMarkdownLinkClick(event, preview, documentPath);
    const target = event.target as HTMLElement | null;
    if (!target || target.closest("a")) return;
    const block = target.closest<HTMLElement>("[data-source-line]");
    const line = Number(block?.dataset.sourceLine || 0);
    if (line > 0) source.revealLine?.(line);
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
      paneRatio,
    }),
    setViewState(value) {
      const state = value as Partial<SplitViewState> | null;
      if (!state) return;
      source.setViewState("source" in state ? state.source : value);
      preview.scrollTop = Math.max(0, state.previewScrollTop || 0);
      if (Number.isFinite(state.paneRatio)) setPaneRatio(state.paneRatio || 0.5);
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
      renderGeneration += 1;
      if (previewTimer) clearTimeout(previewTimer);
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      stopResize();
      source.dispose();
      root.remove();
    },
  };
}
