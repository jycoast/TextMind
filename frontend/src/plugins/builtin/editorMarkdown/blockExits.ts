// Fixes the "cursor trapped inside the last code block" UX problem.
//
// Two complementary plugins are exported:
//
//   trailingParagraphPlugin
//     Ensures the document always ends with an empty paragraph. This means the
//     user can click below the last code/math block to get a writable cursor
//     position, and the ArrowDown key can leave the block naturally. Without
//     this, a document that ends with a `code_block` (or any other isolating
//     block) has nowhere for the caret to go and the user is stuck.
//
//   codeBlockExitKeymap
//     Maps Mod-Enter and Shift-Enter to ProseMirror's `exitCode` command so
//     that while typing inside a code block the user can break out of it
//     with a single keystroke instead of arrowing past every line.
//
// Both plugins are written defensively so they're no-ops when the schema
// doesn't have a `paragraph` node (shouldn't happen with commonmark, but we
// avoid throwing in case some other preset is swapped in later).

import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { keymap } from "@milkdown/prose/keymap";
import { exitCode } from "@milkdown/prose/commands";

export const trailingParagraphPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("TM_TRAILING_PARAGRAPH"),
    appendTransaction: (_transactions, _oldState, newState) => {
      const { doc, schema, tr } = newState;
      const paragraphType = schema.nodes.paragraph;
      if (!paragraphType) return null;
      const last = doc.lastChild;
      // Only act when the doc has content and its last block isn't already
      // a paragraph. This keeps the rule idempotent: once we've appended a
      // paragraph the next pass sees `last.type === paragraph` and exits.
      if (!last || last.type === paragraphType) return null;
      return tr.insert(doc.content.size, paragraphType.create());
    },
  });
});

export const codeBlockExitKeymap = $prose(() => {
  return keymap({
    // Mod-Enter is the conventional shortcut; Shift-Enter is the muscle-
    // memory alternative many editors expose for the same intent.
    "Mod-Enter": exitCode,
    "Shift-Enter": exitCode,
  });
});
