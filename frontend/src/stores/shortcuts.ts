import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { backend } from "@/api/backend";
import {
  ACTION_META,
  ALL_ACTION_IDS,
  buildDefaultBindings,
  parseCombo,
  stringifyCombo,
  type ActionId,
} from "@/composables/shortcutModel";

const SAVE_DEBOUNCE_MS = 300;

function isKnownAction(id: string): id is ActionId {
  return Object.prototype.hasOwnProperty.call(ACTION_META, id);
}

/** Canonicalize an arbitrary text binding into the stored representation. */
function canonicalize(input: string): string {
  const parsed = parseCombo(input);
  if (!parsed) return "";
  return stringifyCombo(parsed);
}

export const useShortcutsStore = defineStore("shortcuts", () => {
  const bindings = ref<Record<ActionId, string>>(buildDefaultBindings());
  const loaded = ref<boolean>(false);

  let saveTimer: number | null = null;

  const defaults = computed<Record<ActionId, string>>(() =>
    buildDefaultBindings(),
  );

  function scheduleSave(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persistNow();
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistNow(): Promise<void> {
    // Only persist bindings that differ from the built-in defaults so the
    // on-disk file stays minimal and self-healing on upgrade.
    const overrides: Record<string, string> = {};
    for (const id of ALL_ACTION_IDS) {
      const cur = bindings.value[id] || "";
      const def = ACTION_META[id].defaultBinding || "";
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
        if (!isKnownAction(rawId)) continue;
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

  function setBinding(id: ActionId, combo: string): void {
    const canon = canonicalize(combo);
    if (!canon) return;
    bindings.value = { ...bindings.value, [id]: canon };
    scheduleSave();
  }

  function clearBinding(id: ActionId): void {
    bindings.value = { ...bindings.value, [id]: "" };
    scheduleSave();
  }

  function resetBinding(id: ActionId): void {
    bindings.value = { ...bindings.value, [id]: ACTION_META[id].defaultBinding };
    scheduleSave();
  }

  function resetAll(): void {
    bindings.value = buildDefaultBindings();
    scheduleSave();
  }

  /** Returns the ActionId currently bound to the given combo (excluding `exceptId`). */
  function findConflict(combo: string, exceptId?: ActionId): ActionId | null {
    const canon = canonicalize(combo);
    if (!canon) return null;
    for (const id of ALL_ACTION_IDS) {
      if (id === exceptId) continue;
      if (bindings.value[id] === canon) return id;
    }
    return null;
  }

  /** Flush any pending debounced save immediately. */
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
    setBinding,
    clearBinding,
    resetBinding,
    resetAll,
    findConflict,
    flush,
  };
});
