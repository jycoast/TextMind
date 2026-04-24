import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore("ui", () => {
  const tip = ref<string>("");
  const centerNotice = ref<string>("");
  let tipTimer: number | null = null;
  let centerTimer: number | null = null;

  function showTip(text: string, durationMs = 1800): void {
    tip.value = text || "";
    if (tipTimer !== null) window.clearTimeout(tipTimer);
    if (!text) return;
    tipTimer = window.setTimeout(() => {
      tip.value = "";
      tipTimer = null;
    }, durationMs);
  }

  function showCenterNotice(text: string, durationMs = 1800): void {
    centerNotice.value = text || "";
    if (centerTimer !== null) window.clearTimeout(centerTimer);
    if (!text) return;
    centerTimer = window.setTimeout(() => {
      centerNotice.value = "";
      centerTimer = null;
    }, durationMs);
  }

  return { tip, centerNotice, showTip, showCenterNotice };
});
