import { defineStore } from "pinia";
import { computed, markRaw, ref, watch, type Component } from "vue";

export interface SidebarPanelDef {
  id: string;
  icon: string;
  title: string;
  order: number;
  component: Component;
}

const ACTIVE_KEY = "TextMind.sidebarActive";
const WIDTH_KEY = "TextMind.sidebarWidth";
const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 260;

function clampWidth(n: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

/**
 * Per-panel widths, keyed by panel id. Each panel remembers its own width so
 * switching panels doesn't reset the layout. Missing ids fall back to
 * DEFAULT_WIDTH. Migrates the pre-multi-panel single width (a bare number)
 * into the "files" slot so existing users keep their sizing.
 */
function loadWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return { files: clampWidth(parsed) };
    }
    if (parsed && typeof parsed === "object") {
      const out: Record<string, number> = {};
      for (const [id, v] of Object.entries(parsed)) {
        if (typeof v === "number" && Number.isFinite(v)) out[id] = clampWidth(v);
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function loadActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) || "files";
  } catch {
    return "files";
  }
}

export const useSidebarStore = defineStore("sidebar", () => {
  const panels = ref<SidebarPanelDef[]>([]);
  const activePanel = ref<string | null>(loadActive());
  const widths = ref<Record<string, number>>(loadWidths());
  const resizing = ref(false);

  const sortedPanels = computed(() =>
    [...panels.value].sort((a, b) => a.order - b.order),
  );

  const currentPanel = computed(() =>
    panels.value.find((p) => p.id === activePanel.value) || null,
  );

  const isCollapsed = computed(() => activePanel.value === null);

  /** Width of the active panel; falls back to DEFAULT_WIDTH when none set. */
  const width = computed(() =>
    activePanel.value ? widths.value[activePanel.value] ?? DEFAULT_WIDTH : DEFAULT_WIDTH,
  );

  watch(activePanel, (v) => {
    try {
      if (v) localStorage.setItem(ACTIVE_KEY, v);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch { /* ignore */ }
  });

  watch(widths, (v) => {
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
  }, { deep: true });

  function register(def: SidebarPanelDef) {
    if (panels.value.some((p) => p.id === def.id)) return;
    panels.value.push({ ...def, component: markRaw(def.component) });
  }

  function toggle(id: string) {
    if (activePanel.value === id) {
      activePanel.value = null;
    } else {
      activePanel.value = id;
    }
  }

  function activate(id: string) {
    activePanel.value = id;
  }

  function collapse() {
    activePanel.value = null;
  }

  function setWidth(next: number) {
    const id = activePanel.value;
    if (!id) return;
    widths.value = { ...widths.value, [id]: clampWidth(next) };
  }

  function setResizing(v: boolean) {
    resizing.value = v;
    document.body.classList.toggle("is-resizing", v);
  }

  return {
    panels,
    sortedPanels,
    activePanel,
    currentPanel,
    isCollapsed,
    width,
    resizing,
    MIN_WIDTH,
    MAX_WIDTH,
    register,
    toggle,
    activate,
    collapse,
    setWidth,
    setResizing,
  };
});
