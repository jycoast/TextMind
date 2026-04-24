import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore("ui", () => {
  const centerNotice = ref<string>("");
  let centerTimer: number | null = null;

  function showCenterNotice(text: string, durationMs = 1800): void {
    centerNotice.value = text || "";
    if (centerTimer !== null) window.clearTimeout(centerTimer);
    if (!text) return;
    centerTimer = window.setTimeout(() => {
      centerNotice.value = "";
      centerTimer = null;
    }, durationMs);
  }

  function showTip(text: string, durationMs = 1800): void {
    showCenterNotice(text, durationMs);
  }

  return { centerNotice, showTip, showCenterNotice };
});
