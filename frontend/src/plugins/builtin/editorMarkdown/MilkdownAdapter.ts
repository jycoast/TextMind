// MilkdownAdapter wraps a Milkdown editor instance behind the EditorAdapter
// contract so it can be slotted into EditorHost.vue alongside Monaco.
//
// The Milkdown editor itself is created asynchronously, so a few adapter
// methods need to buffer their first call (initial setValue / setViewState)
// until create() resolves. Until then getValue returns the pending markdown.

import {
  Editor,
  defaultValueCtx,
  rootCtx,
  editorViewCtx,
  parserCtx,
} from "@milkdown/core";
import { Slice } from "@milkdown/prose/model";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { math, katexOptionsCtx } from "@milkdown/plugin-math";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { codeBlockLanguageView } from "./codeBlockLanguageView";
import {
  trailingParagraphPlugin,
  codeBlockExitKeymap,
} from "./blockExits";
// Refractor language modules. Kept in sync with the extension table in
// `frontend/src/composables/useLanguageGuess.ts` so that the languages users
// can detect / set elsewhere in the app also have WYSIWYG syntax coloring.
// Each `.default` is a Prism-style grammar factory expected by
// refractor.register().
import refractorMarkup from "refractor/markup";
import refractorClike from "refractor/clike";
import refractorJavascript from "refractor/javascript";
import refractorTypescript from "refractor/typescript";
import refractorJson from "refractor/json";
import refractorSql from "refractor/sql";
import refractorPython from "refractor/python";
import refractorGo from "refractor/go";
import refractorJava from "refractor/java";
import refractorC from "refractor/c";
import refractorCpp from "refractor/cpp";
import refractorCsharp from "refractor/csharp";
import refractorPhp from "refractor/php";
import refractorRuby from "refractor/ruby";
import refractorRust from "refractor/rust";
import refractorBash from "refractor/bash";
import refractorPowershell from "refractor/powershell";
import refractorCss from "refractor/css";
import refractorScss from "refractor/scss";
import refractorLess from "refractor/less";
import refractorYaml from "refractor/yaml";
import refractorMarkdown from "refractor/markdown";
import refractorIni from "refractor/ini";
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

// prosemirror-markdown (which Milkdown delegates to for serialization)
// defensively escapes every `_`, `*`, `[`, `]`, etc. emitted from text nodes
// so the round-trip is guaranteed to re-parse to the same doc. That guarantee
// is way too pessimistic in practice — CommonMark explicitly forbids `_`
// from opening emphasis when it is flanked by word characters on both sides,
// so intra-word underscores like `t_sms_order`, `pay_time`, `snake_case_id`
// never need escaping. The serializer doesn't apply that rule and instead
// emits `t\_sms\_order`, which is what users see leaking back into:
//   - `tabs.persistCurrentText()` (called on tab/editor swap and save)
//   - the "文本对比" diff modal (reads adapter.getValue())
//   - the "Source ↔ WYSIWYG" toggle (round-trips through tab.text)
// and ends up baked into the saved file or pasted into a new tab.
//
// We only touch `\_` because (a) it's by far the most common false-positive
// and (b) CommonMark's intra-word rule is unambiguous for `_`. We deliberately
// do NOT unescape `\*` — `*` is allowed to do intra-word emphasis per spec
// (`foo*bar*` is valid), so a defensive escape there can be load-bearing.
//
// A `\\` immediately before `_` (i.e. the user wrote a literal backslash and
// then an underscore) is preserved because the regex requires a single
// non-backslash word char before `\_`; `\` is not in `\w` so `...\\_x` won't
// match.
function unescapeIntraWordUnderscores(md: string): string {
  return md.replace(/(\w)\\_(?=\w)/g, "$1_");
}

function sanitizeSerializedMarkdown(md: string): string {
  return unescapeIntraWordUnderscores(md);
}

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

  // Paste handlers fire BEFORE ProseMirror's default insert so plugins like
  // the COS image uploader can hijack the event, upload the blob async, and
  // call insertText() with the resulting markdown.
  const pasteHandlers: Array<(ev: ClipboardEvent) => boolean | void> = [];
  const onPasteListener = (ev: ClipboardEvent) => {
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
  inner.addEventListener("paste", onPasteListener, true);

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
        // KaTeX options: don't throw on malformed input (would otherwise
        // tear down the WYSIWYG render whenever the user is mid-typing
        // a formula like `$\frac`).
        ctx.set(katexOptionsCtx.key, {
          throwOnError: false,
          errorColor: "#e06c75",
          output: "html",
        });
        // Prism / refractor: register only the languages we explicitly
        // support. The plugin silently skips code blocks whose `language`
        // attr isn't registered (just a console.warn), which is exactly
        // the "no auto-detect" behavior we want — unmarked fences stay
        // as plain text. clike must be registered before c/cpp/csharp/java
        // because those grammars `require` clike at registration time.
        ctx.set(prismConfig.key, {
          configureRefractor: (refractor) => {
            refractor.register(refractorMarkup);
            refractor.register(refractorClike);
            refractor.register(refractorJavascript);
            refractor.register(refractorTypescript);
            refractor.register(refractorJson);
            refractor.register(refractorSql);
            refractor.register(refractorPython);
            refractor.register(refractorGo);
            refractor.register(refractorJava);
            refractor.register(refractorC);
            refractor.register(refractorCpp);
            refractor.register(refractorCsharp);
            refractor.register(refractorPhp);
            refractor.register(refractorRuby);
            refractor.register(refractorRust);
            refractor.register(refractorBash);
            refractor.register(refractorPowershell);
            refractor.register(refractorCss);
            refractor.register(refractorScss);
            refractor.register(refractorLess);
            refractor.register(refractorYaml);
            refractor.register(refractorMarkdown);
            refractor.register(refractorIni);
          },
        });
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
      .use(history)
      .use(listener)
      // math must be registered AFTER commonmark/gfm so its remark plugin and
      // schema nodes layer on top of the base markdown parser. Provides
      // `$inline$` and `$$ block $$` LaTeX rendering via KaTeX.
      .use(math)
      // prism decorates the existing `code_block` node from commonmark with
      // Prism token classes via ProseMirror decorations. Registered last
      // so it sees the final schema.
      .use(prism)
      // codeBlockLanguageView replaces the default <pre>/<code> renderer with
      // a NodeView that overlays an editable language badge in the bottom-
      // right corner. Must come after prism so the contentDOM the prism
      // plugin decorates is the <code> element produced here.
      .use(codeBlockLanguageView)
      // Without these, a code/math block at the end of the document traps
      // the cursor: ProseMirror has nowhere to put the caret after it and
      // arrow-down / clicking below the block does nothing. The trailing
      // paragraph rule keeps an empty paragraph at the end of the doc;
      // the keymap also lets Mod-/Shift-Enter pop out of a code block.
      .use(trailingParagraphPlugin)
      .use(codeBlockExitKeymap);

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
      return sanitizeSerializedMarkdown(editor.action(getMarkdown()));
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

    onPaste: (handler) => {
      pasteHandlers.push(handler);
    },

    revealNthHeading: (index: number) => {
      if (!editor || !booted) return false;
      const target = Math.max(0, Math.floor(index));
      try {
        const view = getView();
        let count = 0;
        let hitPos = -1;
        view.state.doc.descendants((node, pos) => {
          // Returning false from descendants only skips descending into the
          // current node's children, NOT the whole traversal. Without this
          // short-circuit, every subsequent heading would re-satisfy
          // `count === target` (count was never incremented on the match)
          // and hitPos would end up at the LAST heading in the doc.
          if (hitPos >= 0) return false;
          if (node.type.name !== "heading") return true;
          if (count === target) {
            hitPos = pos;
            return false;
          }
          count += 1;
          return true;
        });
        if (hitPos < 0) return false;
        // ProseMirror heading nodes contain inline content starting at
        // pos+1; placing the selection there keeps the caret inside the
        // heading rather than at the block boundary.
        const inside = hitPos + 1;
        const sel = TextSelection.create(view.state.doc, inside);
        view.dispatch(view.state.tr.setSelection(sel));
        const coords = view.coordsAtPos(inside);
        const hostRect = inner.getBoundingClientRect();
        const offsetTop = coords.top - hostRect.top + inner.scrollTop;
        inner.scrollTo({
          top: Math.max(0, offsetTop - 24),
          behavior: "smooth",
        });
        return true;
      } catch (err) {
        console.warn("[milkdown] revealNthHeading:", err);
        return false;
      }
    },

    insertText: (text: string) => {
      if (!editor || !booted || !text) return false;
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const parser = ctx.get(parserCtx);
          // Run the same markdown parser Milkdown uses for the initial doc,
          // then drop the wrapping <doc> and splice its content directly into
          // the current selection. This makes `![alt](url)` become a real
          // image node rather than literal text.
          const parsed = parser(text);
          if (parsed) {
            const slice = new Slice(parsed.content, 0, 0);
            view.dispatch(
              view.state.tr.replaceSelection(slice).scrollIntoView(),
            );
          } else {
            view.dispatch(view.state.tr.insertText(text));
          }
        });
        return true;
      } catch (err) {
        console.warn("[milkdown] insertText:", err);
        return false;
      }
    },

    dispose: () => {
      if (disposed) return;
      disposed = true;
      inner.removeEventListener("contextmenu", onContextMenuListener);
      inner.removeEventListener("paste", onPasteListener, true);
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
