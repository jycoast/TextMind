import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";

// Milkdown renders a task item's checkbox as a native <input type="checkbox">
// inside the <li>. Clicking it flips the input's visual state but never touches
// the ProseMirror document, so the change is lost — it never round-trips to the
// saved Markdown (`- [ ]` / `- [x]`). This plugin intercepts those clicks and
// dispatches a setNodeMarkup that flips the list_item's `checked` attr, then
// swallows the native toggle so the two don't fight.
export const taskListCheckboxPlugin = $prose(() =>
  new Plugin({
    props: {
      handleClickOn(view, _pos, node, nodePos, event, _direct) {
        if (node.type.name !== "list_item") return false;
        if (node.attrs.checked == null) return false;
        const target = event.target as Element | null;
        if (!target || !target.closest('input[type="checkbox"]')) return false;
        event.preventDefault();
        event.stopPropagation();
        // Mirror the toolbar's three-state cycle so a checked item can also be
        // un-marked: null (plain) -> false ([ ]) -> true ([x]) -> null.
        const checked =
          node.attrs.checked == null
            ? false
            : node.attrs.checked === false
              ? true
              : null;
        view.dispatch(
          view.state.tr
            .setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              checked,
            })
            .scrollIntoView(),
        );
        return true;
      },
    },
  }),
);
