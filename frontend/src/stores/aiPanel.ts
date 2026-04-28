import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";

const VISIBLE_KEY = "tinyEditor.aiPanelVisible";
const WIDTH_KEY = "tinyEditor.aiPanelWidth";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 380;

function loadInitialWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch {
    return DEFAULT_WIDTH;
  }
}

function loadInitialVisible(): boolean {
  try {
    return window.localStorage.getItem(VISIBLE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useAIPanelStore = defineStore("aiPanel", () => {
  const visible = ref<boolean>(loadInitialVisible());
  const width = ref<number>(loadInitialWidth());
  const resizing = ref<boolean>(false);

  watch(visible, (v) => {
    try {
      window.localStorage.setItem(VISIBLE_KEY, v ? "1" : "0");
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

  function toggleVisible(): void {
    visible.value = !visible.value;
  }

  function setVisible(v: boolean): void {
    visible.value = Boolean(v);
  }

  function setResizing(v: boolean): void {
    resizing.value = Boolean(v);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("is-resizing", resizing.value);
    }
  }

  return {
    visible,
    width,
    resizing,
    MIN_WIDTH,
    MAX_WIDTH,
    setWidth,
    toggleVisible,
    setVisible,
    setResizing,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIPanelStore, import.meta.hot));
}
