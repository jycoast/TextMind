import * as monaco from "monaco-editor";
import type { EditorAdapter, MonacoViewState } from "@/types";
import { normalizeLanguage, normalizeViewState } from "@/utils/normalize";

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
    },
  });
}

export function getMonacoThemeName(theme: string): string {
  return theme === "light" ? "tiny-light" : "tiny-minimal";
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

  const adapter: EditorAdapter = {
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

    setViewState: (viewState) => {
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
        editor.setScrollTop(0);
        editor.setScrollLeft(0);
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
      editor.executeEdits("tinyEditor", [{ range: sel, text }]);
      return true;
    },

    onChange: (handler) => {
      editor.onDidChangeModelContent(handler);
    },

    onContextMenu: (handler) => {
      contextMenuHandlers.push(handler);
    },

    setColumnMode: (enabled) => applyColumnMode(enabled),

    focus: () => editor.focus(),

    dispose: () => {
      host.removeEventListener("contextmenu", contextMenuListener);
      editor.dispose();
    },
  };

  return adapter;
}
