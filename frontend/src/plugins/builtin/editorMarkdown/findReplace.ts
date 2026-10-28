import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/prose/view";
import type { Node } from "@milkdown/prose/model";

interface TextNodeSpan {
  from: number;
  to: number;
  text: string;
}

interface Match {
  from: number;
  to: number;
}

const findKey = new PluginKey("tm-find-replace");

function collectTextSpans(doc: Node): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      spans.push({
        from: pos,
        to: pos + node.nodeSize,
        text: node.text || "",
      });
    }
  });
  return spans;
}

// NOTE: matches are found per text node, so a phrase split across an inline
// mark boundary (e.g. bold turning "hello" into "he"+"llo") won't match as a
// whole. That is an accepted limitation of node-scoped search for a find bar.
function findMatches(doc: Node, query: string): Match[] {
  const q = query.toLocaleLowerCase();
  if (!q) return [];
  const matches: Match[] = [];
  for (const span of collectTextSpans(doc)) {
    const text = span.text.toLocaleLowerCase();
    let idx = text.indexOf(q);
    while (idx !== -1) {
      matches.push({ from: span.from + idx, to: span.from + idx + q.length });
      idx = text.indexOf(q, idx + q.length);
    }
  }
  return matches;
}

/**
 * Find & replace floating bar for the WYSIWYG editor.
 *
 * - Ctrl/Cmd-F opens the bar; Esc closes it. Enter = next, Shift+Enter = prev.
 * - Matching text is highlighted; the current match is scrolled into view.
 * - Replace swaps the current match, "全部替换" swaps every match at once.
 * - Highlights stay live while you type, without stealing the caret: editing
 *   the document only refreshes highlights near the cursor (debounced), while
 *   explicit actions (typing in the find box, prev/next, replace) move the
 *   caret to a match.
 *
 * Two paths deliberately separate:
 * - `recompute` refreshes the match list / decorations but NEVER touches the
 *   caret or scrolls — used by the live-typing hook and on open.
 * - `gotoMatch` moves the caret and scrolls — used only on explicit nav.
 */
export function findReplacePlugin() {
  return $prose(() => {
    const bar = document.createElement("div");
    bar.className = "tm-findbar";
    bar.hidden = true;

    const findInput = document.createElement("input");
    findInput.className = "tm-findbar__input";
    findInput.placeholder = "查找";
    findInput.autocomplete = "off";
    findInput.spellcheck = false;

    const count = document.createElement("span");
    count.className = "tm-findbar__count";
    count.textContent = "0/0";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "tm-findbar__btn";
    prevBtn.title = "上一个 (Shift+Enter)";
    prevBtn.textContent = "▲";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "tm-findbar__btn";
    nextBtn.title = "下一个 (Enter)";
    nextBtn.textContent = "▼";

    const replaceInput = document.createElement("input");
    replaceInput.className = "tm-findbar__input";
    replaceInput.placeholder = "替换为";
    replaceInput.autocomplete = "off";
    replaceInput.spellcheck = false;

    const replaceBtn = document.createElement("button");
    replaceBtn.type = "button";
    replaceBtn.className = "tm-findbar__btn tm-findbar__btn--wide";
    replaceBtn.textContent = "替换";

    const replaceAllBtn = document.createElement("button");
    replaceAllBtn.type = "button";
    replaceAllBtn.className = "tm-findbar__btn tm-findbar__btn--wide";
    replaceAllBtn.textContent = "全部替换";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tm-findbar__btn";
    closeBtn.title = "关闭 (Esc)";
    closeBtn.textContent = "✕";

    bar.append(
      findInput,
      count,
      prevBtn,
      nextBtn,
      replaceInput,
      replaceBtn,
      replaceAllBtn,
      closeBtn,
    );

    // Per-editor find state lives inside the plugin closure so a separate
    // editor instance never sees another one's matches.
    let query = "";
    let matches: Match[] = [];
    let current = -1;
    // True while we dispatch our own document edits (replace), so the update
    // hook doesn't re-run the search before we've re-found the next match.
    let ownEdit = false;
    let reSearchTimer: ReturnType<typeof setTimeout> | undefined;

    function updateCount(): void {
      count.textContent = matches.length
        ? `${current + 1}/${matches.length}`
        : "0/0";
    }

    function forceRedraw(view: EditorView): void {
      view.dispatch(view.state.tr.setMeta(findKey, true));
    }

    /** Refresh the match list and highlights without moving the caret. */
    function recompute(view: EditorView, newQuery: string, after?: number): void {
      query = newQuery;
      matches = findMatches(view.state.doc, newQuery);
      current = -1;
      if (matches.length) {
        const start = after ?? 0;
        current = matches.findIndex((m) => m.from >= start);
        if (current === -1) current = matches.length - 1;
      }
      updateCount();
      forceRedraw(view);
    }

    /** Move the caret to a match and scroll it into view. */
    function gotoMatch(view: EditorView, index: number): void {
      if (!matches.length) return;
      current = ((index % matches.length) + matches.length) % matches.length;
      const m = matches[current];
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, m.from, m.to))
          .setMeta(findKey, true)
          .scrollIntoView(),
      );
      updateCount();
    }

    /** Debounced live re-search while the user edits the document. */
    function scheduleReSearch(view: EditorView, anchor: number): void {
      if (reSearchTimer) clearTimeout(reSearchTimer);
      reSearchTimer = setTimeout(() => {
        reSearchTimer = undefined;
        recompute(view, query, anchor);
      }, 120);
    }

    function replaceCurrent(view: EditorView): void {
      if (current < 0 || !matches.length) return;
      if (reSearchTimer) clearTimeout(reSearchTimer);
      const m = matches[current];
      ownEdit = true;
      view.dispatch(view.state.tr.insertText(replaceInput.value, m.from, m.to));
      ownEdit = false;
      recompute(view, query, m.from);
      gotoMatch(view, current);
    }

    function replaceAll(view: EditorView): void {
      if (!matches.length) return;
      if (reSearchTimer) clearTimeout(reSearchTimer);
      const repl = replaceInput.value;
      ownEdit = true;
      const tr = view.state.tr;
      for (let i = matches.length - 1; i >= 0; i--) {
        tr.insertText(repl, matches[i].from, matches[i].to);
      }
      view.dispatch(tr);
      ownEdit = false;
      recompute(view, query, 0);
      gotoMatch(view, current);
    }

    function open(view: EditorView): void {
      bar.hidden = false;
      findInput.focus();
      findInput.select();
      // Sync internal state with whatever the input still holds, so reopening
      // immediately re-highlights the previous query instead of leaving a
      // stale, mismatched query behind.
      const value = findInput.value;
      if (value) {
        recompute(view, value, 0);
        gotoMatch(view, current);
      } else {
        query = "";
        matches = [];
        current = -1;
        updateCount();
        forceRedraw(view);
      }
    }

    function close(view: EditorView): void {
      if (reSearchTimer) {
        clearTimeout(reSearchTimer);
        reSearchTimer = undefined;
      }
      bar.hidden = true;
      matches = [];
      current = -1;
      query = "";
      forceRedraw(view);
      view.focus();
    }

    // Keep focus in the find input when clicking a button, so subsequent
    // typing keeps flowing into the query box.
    const keepInputFocus = (event: MouseEvent): void => event.preventDefault();

    function wire(view: EditorView): void {
      findInput.addEventListener("input", () => {
        recompute(view, findInput.value, 0);
        gotoMatch(view, current);
      });
      findInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          gotoMatch(view, current - 1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          gotoMatch(view, current + 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close(view);
        }
      });
      for (const btn of [prevBtn, nextBtn, replaceBtn, replaceAllBtn, closeBtn]) {
        btn.addEventListener("mousedown", keepInputFocus);
      }
      prevBtn.addEventListener("click", () => gotoMatch(view, current - 1));
      nextBtn.addEventListener("click", () => gotoMatch(view, current + 1));
      replaceBtn.addEventListener("click", () => replaceCurrent(view));
      replaceAllBtn.addEventListener("click", () => replaceAll(view));
      closeBtn.addEventListener("click", () => close(view));
    }

    return new Plugin({
      key: findKey,
      props: {
        handleKeyDown(view, event) {
          const isFind =
            event.key.toLocaleLowerCase() === "f" &&
            (event.ctrlKey || event.metaKey);
          if (isFind) {
            event.preventDefault();
            open(view);
            return true;
          }
          if (event.key === "Escape" && !bar.hidden) {
            event.preventDefault();
            close(view);
            return true;
          }
          return false;
        },
        decorations(state) {
          if (!query || !matches.length) return DecorationSet.empty;
          const decos: Decoration[] = [];
          matches.forEach((m, i) => {
            if (m.from === m.to) return;
            decos.push(
              Decoration.inline(m.from, m.to, {
                class: i === current ? "tm-find-current" : "tm-find-match",
              }),
            );
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
      view(view) {
        wire(view);
        view.dom.parentElement?.appendChild(bar);
        return {
          // Refresh highlights while typing, but never steal the caret or
          // scroll — that's what `gotoMatch` is for. Debounced to avoid an
          // O(n) scan on every keystroke. (A PluginView's update is what
          // ProseMirror invokes on every transaction, so the re-search lives
          // here, not on the spec.)
          update(updatedView, prevState) {
            if (ownEdit) return;
            if (updatedView.state.doc === prevState.doc) return;
            if (!query) return;
            const anchor = updatedView.state.selection.from;
            const prevMatch = matches.find(
              (m) => m.from <= anchor && anchor <= m.to,
            );
            scheduleReSearch(
              updatedView,
              prevMatch ? prevMatch.from : anchor,
            );
          },
          destroy() {
            if (reSearchTimer) clearTimeout(reSearchTimer);
            bar.remove();
          },
        };
      },
    });
  });
}
