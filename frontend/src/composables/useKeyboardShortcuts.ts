import { onBeforeUnmount, onMounted } from "vue";
import { useShortcutsStore } from "@/stores/shortcuts";
import { commandRegistry } from "@/plugins/core";
import { matchesCombo, parseCombo } from "./shortcutModel";

export interface ShortcutOptions {
  /** Always-on Escape handler; intentionally not user-customizable. */
  onEscape: () => void;
}

/**
 * Install the global keyboard listener. Bindings live in the shortcuts pinia
 * store (commandId -> combo) and resolve through the CommandRegistry, so any
 * command registered by a plugin is automatically bindable without touching
 * this file.
 *
 * The shortcut listener runs in the CAPTURE phase so it always wins against
 * editor-level keymaps (Monaco, ProseMirror's contentEditable, the codeblock
 * language input, etc). Without this, any descendant that calls
 * preventDefault before the event bubbles back up to `document` (e.g. a
 * focused button on the title bar, the WYSIWYG code-block language badge,
 * some Wails drag-region surfaces) would silently swallow shortcuts like
 * Ctrl+F. For shortcuts we DON'T have bound the listener does nothing and
 * the event continues to the editor unchanged, so Monaco's native handlers
 * (undo/redo/copy/paste/etc.) still work normally.
 *
 * Escape is intentionally kept on the bubble phase: Monaco / ProseMirror /
 * dropdowns all want to react to Escape locally first (dismiss hover,
 * collapse multi-cursor, close completion popup, ...), and only when none
 * of them consumed it should the app-level handler close modals or menus.
 */
export function useKeyboardShortcuts(options: ShortcutOptions): void {
  const shortcutsStore = useShortcutsStore();

  // Seed defaults synchronously so the very first Ctrl+S / Ctrl+F press
  // after startup already routes to a command even if loadFromBackend()
  // hasn't resolved yet.
  shortcutsStore.ensureDefaults();

  const shortcutListener = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") return; // handled by escapeListener below
    if (ev.isComposing || ev.keyCode === 229) return;

    const bindings = shortcutsStore.bindings;
    for (const [commandId, comboText] of Object.entries(bindings)) {
      if (!comboText) continue;
      const combo = parseCombo(comboText);
      if (!combo) continue;
      if (!matchesCombo(ev, combo)) continue;
      // Stale binding for a command that's no longer registered — skip
      // this entry but keep scanning so a later binding can still match.
      if (!commandRegistry.has(commandId)) continue;
      ev.preventDefault();
      ev.stopPropagation();
      void commandRegistry.execute(commandId);
      return;
    }
  };

  const escapeListener = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    if (ev.defaultPrevented) return;
    options.onEscape();
  };

  onMounted(() => {
    document.addEventListener("keydown", shortcutListener, true);
    document.addEventListener("keydown", escapeListener);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("keydown", shortcutListener, true);
    document.removeEventListener("keydown", escapeListener);
  });
}
