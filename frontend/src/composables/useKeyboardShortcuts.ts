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
 */
export function useKeyboardShortcuts(options: ShortcutOptions): void {
  const shortcutsStore = useShortcutsStore();

  const listener = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      options.onEscape();
      return;
    }
    if (ev.isComposing || ev.keyCode === 229) return;
    // Monaco binds many shortcuts (Ctrl+F, Ctrl+H, ...) at the editor level
    // and calls preventDefault when it consumes them. The event still bubbles
    // up to document — skip ours so we don't re-fire the same command.
    if (ev.defaultPrevented) return;

    const bindings = shortcutsStore.bindings;
    for (const [commandId, comboText] of Object.entries(bindings)) {
      if (!comboText) continue;
      const combo = parseCombo(comboText);
      if (!combo) continue;
      if (!matchesCombo(ev, combo)) continue;
      if (!commandRegistry.has(commandId)) return;
      ev.preventDefault();
      void commandRegistry.execute(commandId);
      return;
    }
  };

  onMounted(() => {
    document.addEventListener("keydown", listener);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("keydown", listener);
  });
}
