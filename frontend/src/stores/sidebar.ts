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

function loadWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch {
    return DEFAULT_WIDTH;
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
  const width = ref<number>(loadWidth());
  const resizing = ref(false);

  const sortedPanels = computed(() =>
    [...panels.value].sort((a, b) => a.order - b.order),
  );

  const currentPanel = computed(() =>
    panels.value.find((p) => p.id === activePanel.value) || null,
  );

  const isCollapsed = computed(() => activePanel.value === null);

  watch(activePanel, (v) => {
    try {
      if (v) localStorage.setItem(ACTIVE_KEY, v);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch { /* ignore */ }
  });

  watch(width, (v) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(v));
    } catch { /* ignore */ }
  });

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
    width.value = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next));
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
