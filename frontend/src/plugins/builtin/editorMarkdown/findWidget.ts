// A minimal in-editor "find" bar for Milkdown / ProseMirror, since Milkdown
// has no built-in equivalent of Monaco's actions.find. The widget:
//   - shows a floating input inside the editor host;
//   - walks the ProseMirror doc to find every match of the query string;
//   - paints all matches + the current match via the CSS Custom Highlight
//     API so highlights stay visible even when the editor isn't focused
//     (the user is typing in the find input);
//   - manually scrolls the host container so the current match is centered
//     vertically (ProseMirror's scrollIntoView misbehaves with our sticky
//     find bar);
//   - navigates next/prev with Enter / Shift+Enter / F3, closes on Escape.

import type { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";

interface Match {
  from: number;
  to: number;
}

export interface FindWidgetHandle {
  open: () => void;
  close: () => void;
  destroy: () => void;
}

const HL_ALL_KEY = "tm-milkdown-find-all";
const HL_CURRENT_KEY = "tm-milkdown-find-current";

// Detect support once; CSS.highlights + Highlight constructor are both
// required (Chromium 105+, which WebView2 has shipped for a while).
const supportsCssHighlights = (() => {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as unknown as { Highlight?: unknown }).Highlight ===
      "function" &&
    typeof (CSS as unknown as { highlights?: unknown }).highlights === "object"
  );
})();

let highlightStylesInjected = false;
function ensureHighlightStyles(): void {
  if (highlightStylesInjected || typeof document === "undefined") return;
  highlightStylesInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-tm-injected", "milkdown-find-highlights");
  el.textContent = `
    ::highlight(${HL_ALL_KEY}) {
      background-color: color-mix(in srgb, var(--accent) 28%, transparent);
    }
    ::highlight(${HL_CURRENT_KEY}) {
      background-color: var(--accent);
      color: #ffffff;
    }
  `;
  document.head.appendChild(el);
}

export function createFindWidget(
  host: HTMLElement,
  getView: () => EditorView | null,
): FindWidgetHandle {
  ensureHighlightStyles();

  let open = false;
  let matches: Match[] = [];
  let index = -1;
  let lastQuery = "";

  const bar = document.createElement("div");
  bar.className = "tm-milkdown-find";
  bar.style.display = "none";
  bar.innerHTML = `
    <input type="text" class="tm-milkdown-find__input" placeholder="查找..." />
    <span class="tm-milkdown-find__count">0/0</span>
    <button type="button" class="tm-milkdown-find__btn" data-action="prev" title="上一个 (Shift+Enter)">↑</button>
    <button type="button" class="tm-milkdown-find__btn" data-action="next" title="下一个 (Enter / F3)">↓</button>
    <button type="button" class="tm-milkdown-find__btn" data-action="close" title="关闭 (Esc)">×</button>
  `;
  host.style.position = host.style.position || "relative";
  // Prepend so the sticky bar is visible from scrollTop=0; if we appended it
  // would only stick after the user scrolled past every paragraph first.
  if (host.firstChild) host.insertBefore(bar, host.firstChild);
  else host.appendChild(bar);

  const input = bar.querySelector<HTMLInputElement>(".tm-milkdown-find__input")!;
  const count = bar.querySelector<HTMLSpanElement>(".tm-milkdown-find__count")!;

  function collectMatches(query: string): Match[] {
    const view = getView();
    if (!view || !query) return [];
    const needle = query.toLowerCase();
    const found: Match[] = [];
    view.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      const text = node.text.toLowerCase();
      let from = 0;
      while (true) {
        const i = text.indexOf(needle, from);
        if (i < 0) break;
        found.push({ from: pos + i, to: pos + i + needle.length });
        from = i + Math.max(1, needle.length);
      }
      return true;
    });
    return found;
  }

  function rangeFor(view: EditorView, from: number, to: number): Range | null {
    try {
      const fromDom = view.domAtPos(from);
      const toDom = view.domAtPos(to);
      const r = document.createRange();
      r.setStart(fromDom.node, fromDom.offset);
      r.setEnd(toDom.node, toDom.offset);
      return r;
    } catch {
      return null;
    }
  }

  function repaintHighlights(view: EditorView) {
    if (!supportsCssHighlights) return;
    const Highlight = (window as unknown as {
      Highlight: new (...ranges: Range[]) => unknown;
    }).Highlight;
    const highlights = (CSS as unknown as {
      highlights: Map<string, unknown>;
    }).highlights;
    highlights.delete(HL_ALL_KEY);
    highlights.delete(HL_CURRENT_KEY);
    if (matches.length === 0) return;
    const allRanges: Range[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      if (i === index) continue;
      const r = rangeFor(view, matches[i].from, matches[i].to);
      if (r) allRanges.push(r);
    }
    if (allRanges.length > 0) {
      highlights.set(HL_ALL_KEY, new Highlight(...allRanges));
    }
    if (index >= 0) {
      const cur = matches[index];
      const r = rangeFor(view, cur.from, cur.to);
      if (r) highlights.set(HL_CURRENT_KEY, new Highlight(r));
    }
  }

  function clearHighlights() {
    if (!supportsCssHighlights) return;
    const highlights = (CSS as unknown as {
      highlights: Map<string, unknown>;
    }).highlights;
    highlights.delete(HL_ALL_KEY);
    highlights.delete(HL_CURRENT_KEY);
  }

  function scrollMatchIntoCenter(view: EditorView, m: Match) {
    try {
      const coords = view.coordsAtPos(m.from);
      const hostRect = host.getBoundingClientRect();
      // coords are viewport coords. Convert to host-local then to scrollTop.
      const offsetTop = coords.top - hostRect.top + host.scrollTop;
      const target = offsetTop - host.clientHeight / 2;
      host.scrollTo({
        top: Math.max(0, target),
        behavior: "smooth",
      });
    } catch {
      /* coordsAtPos may throw mid-edit; ignore */
    }
  }

  function updateStatus() {
    if (matches.length === 0) {
      count.textContent = lastQuery ? "0/0" : "";
    } else {
      count.textContent = `${index + 1}/${matches.length}`;
    }
  }

  function jumpTo(i: number) {
    const view = getView();
    if (!view || matches.length === 0) return;
    const next = ((i % matches.length) + matches.length) % matches.length;
    index = next;
    const m = matches[index];
    try {
      const sel = TextSelection.create(view.state.doc, m.from, m.to);
      view.dispatch(view.state.tr.setSelection(sel));
    } catch {
      /* doc shrank under us; refresh on next input */
    }
    scrollMatchIntoCenter(view, m);
    repaintHighlights(view);
    updateStatus();
  }

  function refresh(query: string) {
    lastQuery = query;
    const view = getView();
    matches = collectMatches(query);
    index = matches.length > 0 ? 0 : -1;
    if (matches.length === 0) {
      clearHighlights();
      updateStatus();
      return;
    }
    if (view) {
      try {
        const m = matches[0];
        const sel = TextSelection.create(view.state.doc, m.from, m.to);
        view.dispatch(view.state.tr.setSelection(sel));
        scrollMatchIntoCenter(view, m);
      } catch {
        /* ignore */
      }
      repaintHighlights(view);
    }
    updateStatus();
  }

  function handleKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      handle.close();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (matches.length === 0) {
        refresh(input.value);
        return;
      }
      jumpTo(ev.shiftKey ? index - 1 : index + 1);
      return;
    }
    if (ev.key === "F3") {
      ev.preventDefault();
      jumpTo(ev.shiftKey ? index - 1 : index + 1);
    }
  }

  input.addEventListener("input", () => refresh(input.value));
  input.addEventListener("keydown", handleKey);

  // Prevent the buttons from stealing focus from the input on click — without
  // this Chromium moves focus to the <button> on mousedown, which makes the
  // user lose their typing context for every navigation.
  bar.addEventListener("mousedown", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest(".tm-milkdown-find__btn")) {
      ev.preventDefault();
    }
  });

  bar.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    const btn = target.closest<HTMLElement>(".tm-milkdown-find__btn");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (action === "prev") jumpTo(index - 1);
    else if (action === "next") jumpTo(index + 1);
    else if (action === "close") handle.close();
  });

  const handle: FindWidgetHandle = {
    open: () => {
      open = true;
      bar.style.display = "";
      const view = getView();
      if (view) {
        const sel = view.state.selection;
        if (!sel.empty) {
          const seed = view.state.doc.textBetween(sel.from, sel.to, "\n");
          if (seed && seed.length < 200) input.value = seed;
        }
      }
      input.focus();
      input.select();
      if (input.value) refresh(input.value);
    },
    close: () => {
      if (!open) return;
      open = false;
      bar.style.display = "none";
      matches = [];
      index = -1;
      lastQuery = "";
      clearHighlights();
      const view = getView();
      if (view) view.focus();
    },
    destroy: () => {
      clearHighlights();
      try {
        host.removeChild(bar);
      } catch {
        /* already detached */
      }
    },
  };

  return handle;
}
