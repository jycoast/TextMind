import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { backend } from "@/api/backend";
import { commandRegistry, keybindingRegistry } from "@/plugins/core";
import {
  canonicalizeBinding,
  parseCombo,
  stringifyCombo,
} from "@/composables/shortcutModel";

const SAVE_DEBOUNCE_MS = 300;

function canonicalize(input: string): string {
  return canonicalizeBinding(input);
}

export const useShortcutsStore = defineStore("shortcuts", () => {
  // commandId -> combo string (canonical form); empty string means "no binding".
  const bindings = ref<Record<string, string>>({});
  const loaded = ref<boolean>(false);

  let saveTimer: number | null = null;

  const defaults = computed<Record<string, string>>(() => buildDefaultBindings());

  function buildDefaultBindings(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const cmd of commandRegistry.list()) {
      if (!cmd.bindable) continue;
      const fromCommand = cmd.defaultKeybinding || "";
      const fromRegistry = keybindingRegistry.getDefault(cmd.id);
      out[cmd.id] = fromRegistry || fromCommand || "";
    }
    return out;
  }

  function ensureDefaults(): void {
    const defaults = buildDefaultBindings();
    const next = { ...defaults, ...bindings.value };
    bindings.value = next;
  }

  function scheduleSave(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persistNow();
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistNow(): Promise<void> {
    const defaults = buildDefaultBindings();
    const overrides: Record<string, string> = {};
    for (const [id, cur] of Object.entries(bindings.value)) {
      const def = defaults[id] ?? "";
      if (cur !== def) overrides[id] = cur;
    }
    try {
      await backend.saveKeymapConfig({ bindings: overrides });
    } catch (err) {
      console.warn("shortcuts: save failed", err);
    }
  }

  async function loadFromBackend(): Promise<void> {
    try {
      const cfg = await backend.getKeymapConfig();
      const next = buildDefaultBindings();
      const stored = cfg?.bindings || {};
      for (const [rawId, rawCombo] of Object.entries(stored)) {
        if (typeof rawCombo !== "string") continue;
        if (rawCombo === "") {
          next[rawId] = "";
        } else {
          const canon = canonicalize(rawCombo);
          if (canon) next[rawId] = canon;
        }
      }
      bindings.value = next;
    } catch (err) {
      console.warn("shortcuts: load failed", err);
    } finally {
      loaded.value = true;
    }
  }

  function setBinding(id: string, combo: string): void {
    const canon = canonicalize(combo);
    if (!canon) return;
    bindings.value = { ...bindings.value, [id]: canon };
    scheduleSave();
  }

  function clearBinding(id: string): void {
    bindings.value = { ...bindings.value, [id]: "" };
    scheduleSave();
  }

  function resetBinding(id: string): void {
    const defaults = buildDefaultBindings();
    bindings.value = { ...bindings.value, [id]: defaults[id] ?? "" };
    scheduleSave();
  }

  function resetAll(): void {
    bindings.value = buildDefaultBindings();
    scheduleSave();
  }

  /** Returns the command id currently bound to the given combo (excluding `exceptId`). */
  function findConflict(combo: string, exceptId?: string): string | null {
    const canon = canonicalize(combo);
    if (!canon) return null;
    for (const [id, cur] of Object.entries(bindings.value)) {
      if (id === exceptId) continue;
      if (cur === canon) return id;
    }
    return null;
  }

  async function flush(): Promise<void> {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    await persistNow();
  }

  return {
    bindings,
    loaded,
    defaults,
    loadFromBackend,
    ensureDefaults,
    setBinding,
    clearBinding,
    resetBinding,
    resetAll,
    findConflict,
    flush,
  };
});

// Re-exported here so callers don't have to import shortcutModel directly.
export { parseCombo, stringifyCombo };
