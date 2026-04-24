import { defineStore } from "pinia";
import { ref, watch } from "vue";

const COLLAPSED_KEY = "tinyEditor.explorerCollapsed";
const WIDTH_KEY = "tinyEditor.explorerWidth";
const MIN_WIDTH = 180;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 260;

function loadInitialWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch {
    return DEFAULT_WIDTH;
  }
}

function loadInitialCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export const useExplorerStore = defineStore("explorer", () => {
  const collapsed = ref<boolean>(loadInitialCollapsed());
  const width = ref<number>(loadInitialWidth());
  const resizing = ref<boolean>(false);

  watch(collapsed, (v) => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  });

  watch(width, (v) => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(v));
    } catch {
      /* ignore */
    }
  });

  function setWidth(next: number): void {
    const clamped = Math.max(
      MIN_WIDTH,
      Math.min(MAX_WIDTH, Number(next) || DEFAULT_WIDTH),
    );
    width.value = clamped;
  }

  function toggleCollapsed(): void {
    collapsed.value = !collapsed.value;
  }

  function setCollapsed(v: boolean): void {
    collapsed.value = Boolean(v);
  }

  function setResizing(v: boolean): void {
    resizing.value = Boolean(v);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("is-resizing", resizing.value);
    }
  }

  return {
    collapsed,
    width,
    resizing,
    MIN_WIDTH,
    MAX_WIDTH,
    setWidth,
    toggleCollapsed,
    setCollapsed,
    setResizing,
  };
});
