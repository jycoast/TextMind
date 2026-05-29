import * as monaco from "monaco-editor";
import type {
  CursorPosition,
  EditorAdapter,
  MonacoViewState,
  SelectionStats,
  Theme,
} from "@/types";
import { normalizeLanguage, normalizeViewState } from "@/utils/normalize";
import { registerJsonElementCountHints } from "@/composables/useJsonInlayHints";

// Shared UTF-8 encoder; constructing it is cheap but reused per call keeps GC quiet.
const utf8Encoder = new TextEncoder();

// Inlay-hint provider lives on monaco.languages, not on individual
// editors. Register once at module load so every JSON model picks it up.
registerJsonElementCountHints();

// Monaco palettes for the four built-in app themes. Each entry mirrors the
// corresponding body[data-theme] block in src/styles/base.css so the editor
// surface visually merges with the surrounding panel (no jarring dark square
// when the app is in a light theme, no near-black square in the lavender
// 夜樱 / cream 羊皮卷 palettes).
//
// IMPORTANT: keep the keys here aligned with the `Theme` union in
// src/types/index.ts and with the LIGHT_THEMES set in src/stores/theme.ts.
// `themeToMonacoName` below is the single source of truth used by both the
// Pinia store's computed `monacoThemeName` and the local helper consumed by
// EditorHost / TextDiffModal — so adding a new preset only needs three edits:
// the Theme union, this map, and the styles/base.css palette block.
const MONACO_THEME_BY_APP_THEME: Record<Theme, string> = {
  dark: "tiny-minimal",
  light: "tiny-light",
  sakura: "tiny-sakura",
  parchment: "tiny-parchment",
};

export function defineMonacoThemes(): void {
  monaco.editor.defineTheme("tiny-minimal", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#121214",
      "editor.foreground": "#c4c4c4",
      "editorLineNumber.foreground": "#5a5d64",
      "editorLineNumber.activeForeground": "#7a7d86",
      "editorCursor.foreground": "#9a9ea6",
      "editor.selectionBackground": "#4b74b0b3",
      "editor.inactiveSelectionBackground": "#3e5f8a80",
      "editor.lineHighlightBackground": "#ffffff06",
      "scrollbarSlider.background": "#ffffff18",
      "scrollbarSlider.hoverBackground": "#ffffff28",
      "editorInlayHint.foreground": "#7a7d86",
      "editorInlayHint.background": "#00000000",
    },
  });
  monaco.editor.defineTheme("tiny-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1f2733",
      "editorLineNumber.foreground": "#8a95a8",
      "editorLineNumber.activeForeground": "#5f6b7f",
      "editorCursor.foreground": "#2f4f77",
      "editor.selectionBackground": "#8fb5eacc",
      "editor.inactiveSelectionBackground": "#a8c4e699",
      "editor.lineHighlightBackground": "#00000008",
      "scrollbarSlider.background": "#0000001f",
      "scrollbarSlider.hoverBackground": "#00000033",
      "editorInlayHint.foreground": "#8a95a8",
      "editorInlayHint.background": "#00000000",
    },
  });
  // 夜樱 — Dracula-style slate-violet base with cherry-blossom / iris accents.
  monaco.editor.defineTheme("tiny-sakura", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#6272a4",
      "editorLineNumber.activeForeground": "#bd93f9",
      "editorCursor.foreground": "#ff79c6",
      "editor.selectionBackground": "#bd93f966",
      "editor.inactiveSelectionBackground": "#bd93f933",
      "editor.lineHighlightBackground": "#ffffff08",
      "scrollbarSlider.background": "#bd93f933",
      "scrollbarSlider.hoverBackground": "#bd93f966",
      "editorInlayHint.foreground": "#6272a4",
      "editorInlayHint.background": "#00000000",
    },
  });
  // 羊皮卷 — Solarized Light: warm cream background, muted teal text, classic blue accent.
  monaco.editor.defineTheme("tiny-parchment", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#fdf6e3",
      "editor.foreground": "#586e75",
      "editorLineNumber.foreground": "#93a1a1",
      "editorLineNumber.activeForeground": "#586e75",
      "editorCursor.foreground": "#268bd2",
      "editor.selectionBackground": "#268bd247",
      "editor.inactiveSelectionBackground": "#268bd226",
      "editor.lineHighlightBackground": "#073b4214",
      "scrollbarSlider.background": "#657b8333",
      "scrollbarSlider.hoverBackground": "#657b8366",
      "editorInlayHint.foreground": "#93a1a1",
      "editorInlayHint.background": "#00000000",
    },
  });
}

export function getMonacoThemeName(theme: string): string {
  return (
    MONACO_THEME_BY_APP_THEME[theme as Theme] ?? MONACO_THEME_BY_APP_THEME.dark
  );
}

export interface CreateMonacoAdapterOptions {
  host: HTMLElement;
  initialTheme: string;
}

export function createMonacoAdapter(
  options: CreateMonacoAdapterOptions,
): EditorAdapter {
  const { host, initialTheme } = options;

  const editor = monaco.editor.create(host, {
    value: "",
    language: "plaintext",
    theme: getMonacoThemeName(initialTheme),
    automaticLayout: true,
    minimap: { enabled: false },
    stickyScroll: { enabled: false },
    unicodeHighlight: {
      invisibleCharacters: false,
      ambiguousCharacters: false,
      nonBasicASCII: false,
    },
    lineNumbers: "on",
    wordWrap: "off",
    scrollBeyondLastLine: false,
    contextmenu: false,
    fontSize: 14,
    renderLineHighlight: "line",
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
  });

  function applyColumnMode(enabled: boolean): boolean {
    const model = editor.getModel();
    if (!model) return false;
    if (!enabled) {
      const selections = editor.getSelections();
      const primary =
        selections && selections.length > 0
          ? selections[0]
          : editor.getSelection();
      if (primary) editor.setSelection(primary);
      editor.focus();
      return true;
    }
    const lineCount = model.getLineCount();
    const selections: monaco.Selection[] = [];
    for (let line = 1; line <= lineCount; line += 1) {
      const col = model.getLineMaxColumn(line);
      selections.push(new monaco.Selection(line, col, line, col));
    }
    if (selections.length === 0) return false;
    editor.setSelections(selections);
    editor.focus();
    return true;
  }

  const contextMenuHandlers: Array<(ev: MouseEvent) => void> = [];
  const contextMenuListener = (ev: MouseEvent) => {
    contextMenuHandlers.forEach((h) => h(ev));
  };
  host.addEventListener("contextmenu", contextMenuListener);

  // Paste interception — capture phase so we run before Monaco's default
  // handler. If a handler returns true / preventDefault we swallow the
  // event entirely and skip Monaco's insert.
  const pasteHandlers: Array<(ev: ClipboardEvent) => boolean | void> = [];
  const pasteListener = (ev: ClipboardEvent) => {
    if (pasteHandlers.length === 0) return;
    for (const h of pasteHandlers) {
      const consumed = h(ev) === true || ev.defaultPrevented;
      if (consumed) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }
  };
  host.addEventListener("paste", pasteListener, true);

  const selectionsChangeHandlers: Array<(count: number) => void> = [];
  const cursorChangeHandlers: Array<() => void> = [];
  editor.onDidChangeCursorSelection(() => {
    const selections = editor.getSelections();
    const count = selections ? selections.length : 0;
    selectionsChangeHandlers.forEach((h) => h(count));
    cursorChangeHandlers.forEach((h) => h());
  });
  editor.onDidChangeCursorPosition(() => {
    cursorChangeHandlers.forEach((h) => h());
  });
  // Edits can change cursor coordinates relative to the document even when
  // the cursor object itself didn't fire (e.g. text inserted before it).
  editor.onDidChangeModelContent(() => {
    cursorChangeHandlers.forEach((h) => h());
  });

  const adapter: EditorAdapter = {
    id: "monaco",
    mode: "monaco",
    supportsColumnMode: true,

    getViewState: (): MonacoViewState => {
      const sel = editor.getSelection();
      return {
        scrollTop: editor.getScrollTop(),
        scrollLeft: editor.getScrollLeft(),
        startLineNumber: sel?.startLineNumber || 1,
        startColumn: sel?.startColumn || 1,
        endLineNumber: sel?.endLineNumber || 1,
        endColumn: sel?.endColumn || 1,
      };
    },

    setViewState: (viewState: unknown) => {
      const model = editor.getModel();
      if (!model) return;
      const v = normalizeViewState(viewState);
      if (!v) return;
      if (
        Number.isFinite(v.startLineNumber) &&
        Number.isFinite(v.startColumn) &&
        Number.isFinite(v.endLineNumber) &&
        Number.isFinite(v.endColumn)
      ) {
        const lineMax = model.getLineCount();
        const startLine = Math.min(
          lineMax,
          Math.max(1, v.startLineNumber as number),
        );
        const endLine = Math.min(
          lineMax,
          Math.max(1, v.endLineNumber as number),
        );
        const startCol = Math.min(
          model.getLineMaxColumn(startLine),
          Math.max(1, v.startColumn as number),
        );
        const endCol = Math.min(
          model.getLineMaxColumn(endLine),
          Math.max(1, v.endColumn as number),
        );
        editor.setSelection(
          new monaco.Selection(startLine, startCol, endLine, endCol),
        );
      }
      editor.setScrollTop(Math.max(0, v.scrollTop || 0));
      editor.setScrollLeft(Math.max(0, v.scrollLeft || 0));
      editor.render(true);
    },

    forceRefresh: () => {
      editor.layout();
      editor.render(true);
    },

    setLanguage: (language) => {
      const model = editor.getModel();
      if (!model) return;
      const lang = normalizeLanguage(language);
      if (model.getLanguageId() === lang) return;
      monaco.editor.setModelLanguage(model, lang);
    },

    setTheme: (themeName) => {
      monaco.editor.setTheme(themeName || getMonacoThemeName(initialTheme));
    },

    getValue: () => editor.getValue(),

    setValue: (value) => {
      if (editor.getValue() !== value) {
        editor.setValue(value || "");
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.setScrollPosition(
          { scrollTop: 0, scrollLeft: 0 },
          monaco.editor.ScrollType.Immediate,
        );
        editor.revealPosition(
          { lineNumber: 1, column: 1 },
          monaco.editor.ScrollType.Immediate,
        );
        editor.render(true);
      }
    },

    getSelectionText: () => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel || sel.isEmpty()) return "";
      return model.getValueInRange(sel);
    },

    replaceSelection: (text) => {
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) return false;
      const startLine = sel.startLineNumber;
      const startColumn = sel.startColumn;
      editor.executeEdits("TextMind", [{ range: sel, text }]);
      editor.setPosition({ lineNumber: startLine, column: startColumn });
      editor.revealPosition(
        { lineNumber: startLine, column: startColumn },
        monaco.editor.ScrollType.Immediate,
      );
      return true;
    },

    onChange: (handler) => {
      editor.onDidChangeModelContent(handler);
    },

    onContextMenu: (handler) => {
      contextMenuHandlers.push(handler);
    },

    onSelectionsChange: (handler) => {
      selectionsChangeHandlers.push(handler);
    },

    getCursorPosition: (): CursorPosition => {
      const pos = editor.getPosition();
      return {
        line: pos?.lineNumber || 1,
        column: pos?.column || 1,
      };
    },

    getSelectionStats: (): SelectionStats => {
      const model = editor.getModel();
      const selections = editor.getSelections();
      if (!model || !selections || selections.length === 0) {
        return { hasSelection: false, lineCount: 0, charCount: 0, byteCount: 0 };
      }
      let charCount = 0;
      let byteCount = 0;
      let lineCount = 0;
      let hasSelection = false;
      for (const sel of selections) {
        if (sel.isEmpty()) continue;
        hasSelection = true;
        const text = model.getValueInRange(sel);
        charCount += text.length;
        byteCount += utf8Encoder.encode(text).byteLength;
        const spanned =
          Math.abs(sel.endLineNumber - sel.startLineNumber) + 1;
        lineCount += spanned;
      }
      if (!hasSelection) {
        return { hasSelection: false, lineCount: 0, charCount: 0, byteCount: 0 };
      }
      return { hasSelection: true, lineCount, charCount, byteCount };
    },

    onCursorChange: (handler) => {
      cursorChangeHandlers.push(handler);
    },

    setColumnMode: (enabled) => applyColumnMode(enabled),

    focus: () => editor.focus(),

    triggerFind: () => {
      const action = editor.getAction("actions.find");
      if (!action) return false;
      editor.focus();
      void action.run();
      return true;
    },

    onPaste: (handler) => {
      pasteHandlers.push(handler);
    },

    insertText: (text: string) => {
      const sel = editor.getSelection();
      if (!sel) return false;
      editor.executeEdits("TextMind.insertText", [{ range: sel, text }]);
      editor.focus();
      return true;
    },

    revealLine: (line: number, col?: number) => {
      const model = editor.getModel();
      if (!model) return false;
      const lineMax = model.getLineCount();
      const target = Math.min(lineMax, Math.max(1, Math.floor(line)));
      const column = Math.max(1, Math.floor(col ?? 1));
      editor.setPosition({ lineNumber: target, column });
      editor.revealLineInCenter(target, monaco.editor.ScrollType.Smooth);
      editor.focus();
      return true;
    },

    dispose: () => {
      host.removeEventListener("contextmenu", contextMenuListener);
      host.removeEventListener("paste", pasteListener, true);
      editor.dispose();
    },
  };

  return adapter;
}
