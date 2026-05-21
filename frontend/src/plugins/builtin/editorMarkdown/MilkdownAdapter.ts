// MilkdownAdapter wraps a Milkdown editor instance behind the EditorAdapter
// contract so it can be slotted into EditorHost.vue alongside Monaco.
//
// The Milkdown editor itself is created asynchronously, so a few adapter
// methods need to buffer their first call (initial setValue / setViewState)
// until create() resolves. Until then getValue returns the pending markdown.

import { Editor, defaultValueCtx, rootCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { getMarkdown, replaceAll } from "@milkdown/utils";
import { TextSelection } from "@milkdown/prose/state";
import { themedStyles } from "./theme";
import { createFindWidget, type FindWidgetHandle } from "./findWidget";

// The bundled @milkdown/theme-nord is a hardcoded dark theme which leaves
// body text invisible in our light mode. We ship our own minimal stylesheet
// that drives every visual property off the app's CSS variables so the
// editor adapts to both themes automatically.
let stylesInjected = false;
function ensureStylesInjected(): void {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-tm-injected", "milkdown-theme");
  el.textContent = themedStyles;
  document.head.appendChild(el);
}

import type {
  CursorPosition,
  EditorAdapter,
  SelectionStats,
} from "@/types";

const utf8Encoder = new TextEncoder();

export interface MilkdownAdapterOptions {
  host: HTMLElement;
  initialTheme: string;
}

interface MilkdownViewState {
  scrollTop: number;
  anchor: number;
  head: number;
}

export function createMilkdownAdapter(
  options: MilkdownAdapterOptions,
): EditorAdapter {
  ensureStylesInjected();
  const { host } = options;

  // Wrapper div so we can scope styles without colliding with Monaco's host.
  const inner = document.createElement("div");
  inner.className = "tm-milkdown-host";
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.overflow = "auto";
  inner.style.padding = "16px 20px";
  inner.style.boxSizing = "border-box";
  host.appendChild(inner);

  // pendingValue stores writes that arrive before the editor finishes booting,
  // and stays in sync afterward so getValue() before the first user edit is
  // still correct without paying for a ProseMirror serialize.
  let pendingValue = "";
  let editor: Editor | null = null;
  let booted = false;
  let disposed = false;
  // Boot starts with onChange suppressed so the initial document insert (which
  // ProseMirror models as a transaction) doesn't propagate up and clobber
  // tab.text with an empty string.
  let suppressOnChange = true;

  const changeHandlers: Array<() => void> = [];
  const cursorHandlers: Array<() => void> = [];
  const selectionsHandlers: Array<(count: number) => void> = [];
  const contextMenuHandlers: Array<(ev: MouseEvent) => void> = [];

  const onContextMenuListener = (ev: MouseEvent) => {
    for (const h of contextMenuHandlers) h(ev);
  };
  inner.addEventListener("contextmenu", onContextMenuListener);

  function emitCursor() {
    for (const h of cursorHandlers) h();
  }
  function emitSelectionsCount(count: number) {
    for (const h of selectionsHandlers) h(count);
  }

  // Boot the Milkdown editor asynchronously. Until it's ready, getValue()
  // returns the pending value and setValue() updates that pending value.
  void (async () => {
    const e = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, inner);
        // pendingValue is captured by Milkdown at config-evaluation time. If
        // we lose the race against an early setValue() the second replaceAll
        // below still recovers, but seeding it here avoids an empty-flash.
        ctx.set(defaultValueCtx, pendingValue);
        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, md, _prev) => {
            pendingValue = md;
            if (suppressOnChange) return;
            for (const h of changeHandlers) h();
          })
          .selectionUpdated((_ctx, sel) => {
            emitCursor();
            emitSelectionsCount(sel.empty ? 1 : 1);
          });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener);

    try {
      await e.create();
      // dispose() may have run while we were awaiting. Bail out cleanly so
      // we don't leak an editor mounted into a detached DOM node.
      if (disposed) {
        await e.destroy().catch(() => {});
        return;
      }
      editor = e;
      booted = true;
      // Race fix: setValue() calls that landed before / during boot only
      // updated pendingValue and never reached the editor. Re-apply now so
      // the user sees the file content even when the config callback ran
      // with an empty pendingValue.
      if (pendingValue) {
        try {
          e.action(replaceAll(pendingValue));
        } catch (err) {
          console.warn("[milkdown] initial replaceAll:", err);
        }
      }
    } catch (err) {
      console.error("[milkdown] failed to boot:", err);
    } finally {
      // From this point user edits are real change events.
      suppressOnChange = false;
    }
  })();

  function readMarkdown(): string {
    if (!editor) return pendingValue;
    try {
      return editor.action(getMarkdown());
    } catch (err) {
      console.warn("[milkdown] getMarkdown:", err);
      return pendingValue;
    }
  }

  function writeMarkdown(md: string) {
    pendingValue = md;
    if (!editor) return;
    const prevSuppress = suppressOnChange;
    suppressOnChange = true;
    try {
      editor.action(replaceAll(md));
    } catch (err) {
      console.warn("[milkdown] replaceAll:", err);
    } finally {
      // Restore (instead of unconditionally setting false) so a writeMarkdown
      // that races against the boot path doesn't accidentally re-enable
      // change events before boot finishes.
      suppressOnChange = prevSuppress;
    }
  }

  function withView<T>(fn: (view: ReturnType<typeof getView>) => T): T | null {
    if (!editor || !booted) return null;
    try {
      return fn(getView());
    } catch (err) {
      console.warn("[milkdown] view op:", err);
      return null;
    }
  }

  function getView() {
    if (!editor) throw new Error("milkdown editor not ready");
    return editor.action((ctx) => ctx.get(editorViewCtx));
  }

  // Lazy-created so we don't allocate DOM for editors the user never searches in.
  let findWidget: FindWidgetHandle | null = null;
  function ensureFindWidget(): FindWidgetHandle {
    if (findWidget) return findWidget;
    findWidget = createFindWidget(inner, () => {
      if (!editor || !booted) return null;
      try {
        return getView();
      } catch {
        return null;
      }
    });
    return findWidget;
  }

  const adapter: EditorAdapter = {
    id: "milkdown",
    mode: "textarea",
    supportsColumnMode: false,

    getViewState: (): MilkdownViewState | null => {
      const view = withView((v) => v);
      if (!view) return null;
      const sel = view.state.selection;
      return {
        scrollTop: inner.scrollTop || 0,
        anchor: sel.anchor,
        head: sel.head,
      };
    },

    setViewState: (state: unknown) => {
      const v = state as MilkdownViewState | null;
      if (!v) return;
      withView((view) => {
        try {
          const docSize = view.state.doc.content.size;
          const anchor = Math.max(0, Math.min(v.anchor || 0, docSize));
          const head = Math.max(0, Math.min(v.head || anchor, docSize));
          const sel = TextSelection.create(view.state.doc, anchor, head);
          view.dispatch(view.state.tr.setSelection(sel));
          inner.scrollTop = v.scrollTop || 0;
        } catch (err) {
          console.warn("[milkdown] restore selection:", err);
        }
      });
    },

    forceRefresh: () => {
      // Milkdown auto-lays out via ProseMirror; nothing to flush.
    },

    setLanguage: () => {
      // Markdown only - language switches are a no-op here.
    },

    setTheme: () => {
      // Theme is fixed (nord) for now; light/dark toggle would require a
      // dedicated theme. Future extension point.
    },

    getValue: () => readMarkdown(),
    setValue: (value: string) => writeMarkdown(value || ""),

    getSelectionText: () => {
      return (
        withView((view) => {
          const sel = view.state.selection;
          if (sel.empty) return "";
          return view.state.doc.textBetween(sel.from, sel.to, "\n");
        }) || ""
      );
    },

    replaceSelection: (text: string) => {
      const ok = withView((view) => {
        const sel = view.state.selection;
        if (sel.empty) return false;
        const tr = view.state.tr.replaceWith(
          sel.from,
          sel.to,
          view.state.schema.text(text),
        );
        view.dispatch(tr);
        return true;
      });
      return Boolean(ok);
    },

    onChange: (handler) => {
      changeHandlers.push(handler);
    },

    onContextMenu: (handler) => {
      contextMenuHandlers.push(handler);
    },

    onSelectionsChange: (handler) => {
      selectionsHandlers.push(handler);
    },

    getCursorPosition: (): CursorPosition => {
      const result = withView((view) => {
        const pos = view.state.selection.head;
        // ProseMirror has no native line numbers; approximate by counting
        // newlines in the textBetween from the start of the doc.
        const before = view.state.doc.textBetween(0, pos, "\n");
        const lines = before.split("\n");
        const line = lines.length;
        const column = (lines[lines.length - 1] || "").length + 1;
        return { line, column };
      });
      return result || { line: 1, column: 1 };
    },

    getSelectionStats: (): SelectionStats => {
      const fallback: SelectionStats = {
        hasSelection: false,
        lineCount: 0,
        charCount: 0,
        byteCount: 0,
      };
      const result = withView((view) => {
        const sel = view.state.selection;
        if (sel.empty) return fallback;
        const text = view.state.doc.textBetween(sel.from, sel.to, "\n");
        return {
          hasSelection: true,
          lineCount: text.split("\n").length,
          charCount: text.length,
          byteCount: utf8Encoder.encode(text).byteLength,
        };
      });
      return result || fallback;
    },

    onCursorChange: (handler) => {
      cursorHandlers.push(handler);
    },

    setColumnMode: () => false,

    focus: () => {
      withView((view) => view.focus());
    },

    triggerFind: () => {
      if (!booted) return false;
      ensureFindWidget().open();
      return true;
    },

    dispose: () => {
      if (disposed) return;
      disposed = true;
      inner.removeEventListener("contextmenu", onContextMenuListener);
      if (findWidget) {
        findWidget.destroy();
        findWidget = null;
      }
      const maybe = editor;
      editor = null;
      if (maybe) {
        maybe.destroy().catch(() => {
          /* ignore */
        });
      }
      try {
        host.removeChild(inner);
      } catch {
        /* already removed */
      }
    },
  };

  return adapter;
}
