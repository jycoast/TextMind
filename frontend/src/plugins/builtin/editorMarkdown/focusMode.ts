import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { useFocusMode } from "@/composables/useFocusMode";

/**
 * Typewriter + focus modes for the WYSIWYG editor.
 *
 * - typewriter: keeps the active block near the vertical center of the editor
 *   while you type, so the line you are writing on never slides out of view.
 * - focus: dims every block except the one you are editing.
 *
 * The active block is a direct child of the ProseMirror element (top-level
 * block), found by walking up until the parent is the editor root.
 */
export function focusModePlugin() {
  const { mode } = useFocusMode();

  return $prose(() => {
    const key = new PluginKey("tm-focus-mode");
    let currentView: EditorView | null = null;
    let raf = 0;
    let lastPosition = -1;

    function applyClassNames(view: EditorView): void {
      const typewriter =
        mode.value === "typewriter" || mode.value === "both";
      const focus = mode.value === "focus" || mode.value === "both";
      view.dom.classList.toggle("tm-typewriter", typewriter);
      view.dom.classList.toggle("tm-focus", focus);
      updateActiveBlock(view);
    }

    function activeBlock(view: EditorView): HTMLElement | null {
      const dom = view.domAtPos(view.state.selection.from).node as HTMLElement;
      if (!dom || !view.dom.contains(dom)) return null;
      let block: HTMLElement | null = dom;
      while (block && block.parentElement !== view.dom) block = block.parentElement;
      return block === view.dom ? null : block;
    }

    function updateActiveBlock(view: EditorView): void {
      view.dom
        .querySelectorAll(".tm-focus-active")
        .forEach((el) => el.classList.remove("tm-focus-active"));
      if (mode.value === "off" || mode.value === "typewriter") return;
      const block = activeBlock(view);
      if (block) block.classList.add("tm-focus-active");
    }

    function nearestScrollContainer(el: HTMLElement): HTMLElement {
      let container = el.parentElement as HTMLElement | null;
      while (container) {
        if (container.scrollHeight > container.clientHeight + 1) return container;
        container = container.parentElement;
      }
      return document.scrollingElement as HTMLElement;
    }

    function centerActiveBlock(view: EditorView): void {
      if (mode.value !== "typewriter" && mode.value !== "both") return;
      const block = activeBlock(view);
      if (!block) return;
      const container = nearestScrollContainer(view.dom);
      const rect = block.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      if (!cRect.height || !rect.height) return;
      const center = cRect.top + cRect.height / 2;
      const offset = rect.top + rect.height / 2 - center;
      if (Math.abs(offset) < 36) return;
      container.scrollBy({ top: offset, behavior: "smooth" });
    }

    function scheduleCenter(view: EditorView, position: number): void {
      if (position === lastPosition) return;
      lastPosition = position;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        centerActiveBlock(view);
      });
    }

    return new Plugin({
      key,
      view(view) {
        currentView = view;
        applyClassNames(view);
        const onScroll = (event: Event) => {
          event.stopPropagation();
        };
        view.dom.addEventListener("scroll", onScroll, true);
        return {
          update: (updatedView) => {
            applyClassNames(updatedView);
          },
          destroy() {
            view.dom.removeEventListener("scroll", onScroll, true);
            if (raf) cancelAnimationFrame(raf);
            currentView = null;
          },
        };
      },
      // Re-center whenever the selection moves (typing/cursor/arrows).
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.selectionSet)) return null;
        const view = currentView;
        if (!view) return null;
        updateActiveBlock(view);
        if (mode.value === "off") return null;
        scheduleCenter(view, newState.selection.from);
        return null;
      },
    });
  });
}
