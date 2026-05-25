import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from "@wails/runtime/runtime";

// Thin wrapper over the Wails v2 window runtime API so components can stay
// framework-agnostic and so dev (vite-only) sessions degrade gracefully when
// the runtime binding hasn't been injected yet.
export function useWindowControls() {
  const isMaximised = ref(false);

  async function sync(): Promise<void> {
    try {
      isMaximised.value = await WindowIsMaximised();
    } catch {
      // Runtime not available (e.g. plain `vite dev` outside Wails).
    }
  }

  let resizeTimer: number | null = null;
  function onResize(): void {
    if (resizeTimer != null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      void sync();
    }, 60);
  }

  onMounted(() => {
    void sync();
    window.addEventListener("resize", onResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize);
    if (resizeTimer != null) window.clearTimeout(resizeTimer);
  });

  function minimise(): void {
    try {
      WindowMinimise();
    } catch {
      // ignore in dev
    }
  }

  async function toggleMaximise(): Promise<void> {
    try {
      WindowToggleMaximise();
    } catch {
      // ignore in dev
    }
    await sync();
  }

  function close(): void {
    try {
      Quit();
    } catch {
      // ignore in dev
    }
  }

  return {
    isMaximised,
    minimise,
    toggleMaximise,
    close,
  };
}
