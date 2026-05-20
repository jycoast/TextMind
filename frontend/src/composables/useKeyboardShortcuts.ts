import { onBeforeUnmount, onMounted } from "vue";
import { useShortcutsStore } from "@/stores/shortcuts";
import {
  ALL_ACTION_IDS,
  matchesCombo,
  parseCombo,
  type ActionId,
} from "./shortcutModel";

export interface ShortcutOptions {
  /**
   * Map from ActionId to the handler invoked when its bound combo fires.
   * Missing entries mean the action exists but is not currently wired (e.g.
   * the file menu's "open file" can be unbound by default and still appear
   * in the settings modal).
   */
  handlers: Partial<Record<ActionId, () => void>>;
  /** Always-on Escape handler; intentionally not user-customizable. */
  onEscape: () => void;
}

/**
 * Install the global keyboard listener. Bindings are read live from the
 * shortcuts pinia store, so any in-place edits via the settings modal take
 * effect immediately without remounting.
 */
export function useKeyboardShortcuts(options: ShortcutOptions): void {
  const shortcutsStore = useShortcutsStore();

  const listener = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      options.onEscape();
      return;
    }
    if (ev.isComposing || ev.keyCode === 229) return;

    const bindings = shortcutsStore.bindings;
    for (const id of ALL_ACTION_IDS) {
      const comboText = bindings[id];
      if (!comboText) continue;
      const combo = parseCombo(comboText);
      if (!combo) continue;
      if (!matchesCombo(ev, combo)) continue;
      const handler = options.handlers[id];
      if (!handler) return;
      ev.preventDefault();
      handler();
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
