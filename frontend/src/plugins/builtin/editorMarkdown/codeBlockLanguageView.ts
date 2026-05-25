// Custom NodeView for the commonmark `code_block` node that adds an editable
// language badge anchored to the bottom-right corner of the rendered <pre>.
//
// Behavior:
//   - The badge is always rendered but kept visually quiet (muted color, low
//     opacity); see theme.ts. It brightens on hover or when the input has
//     focus, making it discoverable without dominating the editor.
//   - Typing in the input dispatches a setNodeMarkup transaction so the
//     prism plugin re-decorates the code block in real time.
//   - A shared <datalist> seeds autocomplete from the same language list that
//     MilkdownAdapter.ts registers with refractor.
//
// Implementation notes:
//   - The badge lives INSIDE the <pre> (which is also the NodeView root) so
//     positioning is trivial via `position: absolute` against the relatively
//     positioned <pre>. To keep ProseMirror from mistaking input typing for
//     document edits we override `ignoreMutation` and `stopEvent`.
//   - `contentDOM` is the <code> child, which preserves the existing
//     commonmark schema, prism decorations and history behavior.

import { $prose } from "@milkdown/utils";
import { Plugin, TextSelection } from "@milkdown/prose/state";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";

const KNOWN_LANGUAGES = [
  "javascript",
  "typescript",
  "json",
  "sql",
  "python",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "rust",
  "bash",
  "powershell",
  "markup",
  "css",
  "scss",
  "less",
  "yaml",
  "markdown",
  "ini",
];

const DATALIST_ID = "tm-md-codeblock-langs";

// The <datalist> is shared across every code-block badge; mount it lazily.
function ensureDatalist(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(DATALIST_ID)) return;
  const dl = document.createElement("datalist");
  dl.id = DATALIST_ID;
  for (const lang of KNOWN_LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang;
    dl.appendChild(opt);
  }
  document.body.appendChild(dl);
}

function buildView(
  initialNode: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  ensureDatalist();

  let node = initialNode;

  const pre = document.createElement("pre");
  pre.setAttribute("data-type", "code_block");

  const code = document.createElement("code");
  pre.appendChild(code);

  const badge = document.createElement("div");
  badge.className = "tm-md-codeblock-lang";
  badge.setAttribute("contenteditable", "false");

  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("list", DATALIST_ID);
  input.placeholder = "lang";
  input.value = node.attrs.language || "";
  input.className = "tm-md-codeblock-lang__input";
  badge.appendChild(input);

  pre.appendChild(badge);

  // The badge sits inside the editor root, so by default ProseMirror would
  // treat clicks/typing in the input as document interaction. Swallow the
  // relevant events at the badge boundary so the input behaves like a normal
  // form control.
  const swallow = (ev: Event) => ev.stopPropagation();
  badge.addEventListener("mousedown", swallow);
  badge.addEventListener("click", swallow);
  badge.addEventListener("keyup", swallow);
  badge.addEventListener("keypress", swallow);

  function commitLanguage(value: string) {
    const pos = getPos();
    if (pos == null) return;
    const trimmed = (value || "").trim();
    if ((node.attrs.language || "") === trimmed) return;
    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      language: trimmed,
    });
    // Preserve the user's existing selection across the schema change so the
    // caret doesn't get yanked from the input or jump unexpectedly.
    tr.setSelection(view.state.selection.map(tr.doc, tr.mapping));
    view.dispatch(tr);
  }

  input.addEventListener("input", () => commitLanguage(input.value));
  input.addEventListener("change", () => commitLanguage(input.value));

  // Enter should commit the value and move focus into the code body so the
  // user can keep typing code. Escape blurs the input without other side
  // effects. Both events are stopped from leaking to ProseMirror.
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitLanguage(input.value);
      const pos = getPos();
      if (pos != null) {
        // pos + 1 lands inside the code_block's text content.
        const tr = view.state.tr.setSelection(
          TextSelection.create(view.state.doc, pos + 1),
        );
        view.dispatch(tr);
        view.focus();
      }
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      input.blur();
    }
  });

  return {
    dom: pre,
    contentDOM: code,
    update(updatedNode) {
      if (updatedNode.type.name !== "code_block") return false;
      node = updatedNode;
      const nextLang = updatedNode.attrs.language || "";
      // Only refresh the input value when the user is not actively editing it,
      // otherwise we'd clobber what they just typed and reset caret position.
      if (document.activeElement !== input && input.value !== nextLang) {
        input.value = nextLang;
      }
      return true;
    },
    ignoreMutation(mutation) {
      // Any DOM change inside the badge is bookkeeping (input value, focus
      // ring, etc.) and never represents a document edit.
      return badge.contains(mutation.target as Node);
    },
    stopEvent(event) {
      // Pointer / keyboard events that originate inside the badge belong to
      // the form control, not the ProseMirror view.
      const t = event.target as Node | null;
      return Boolean(t && badge.contains(t));
    },
    destroy() {
      badge.removeEventListener("mousedown", swallow);
      badge.removeEventListener("click", swallow);
      badge.removeEventListener("keyup", swallow);
      badge.removeEventListener("keypress", swallow);
    },
  };
}

export const codeBlockLanguageView = $prose(() => {
  return new Plugin({
    props: {
      nodeViews: {
        code_block: (node, view, getPos) =>
          buildView(
            node as ProseNode,
            view as EditorView,
            getPos as () => number | undefined,
          ),
      },
    },
  });
});
