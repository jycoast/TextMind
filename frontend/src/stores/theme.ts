import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";
import type { Theme } from "@/types";

const THEME_STORAGE_KEY = "tinyEditor.theme";

function loadInitialTheme(): Theme {
  try {
    const t = String(
      window.localStorage.getItem(THEME_STORAGE_KEY) || "",
    ).toLowerCase();
    return t === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export const useThemeStore = defineStore("theme", () => {
  const theme = ref<Theme>(loadInitialTheme());

  const monacoThemeName = computed(() =>
    theme.value === "light" ? "tiny-light" : "tiny-minimal",
  );

  watchEffect(() => {
    document.body.dataset.theme = theme.value;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme.value);
    } catch {
      /* ignore */
    }
    const runtime = (window as unknown as {
      runtime?: {
        WindowSetLightTheme?: () => void;
        WindowSetDarkTheme?: () => void;
      };
    }).runtime;
    if (runtime) {
      if (theme.value === "light" && typeof runtime.WindowSetLightTheme === "function") {
        runtime.WindowSetLightTheme();
      } else if (
        theme.value === "dark" &&
        typeof runtime.WindowSetDarkTheme === "function"
      ) {
        runtime.WindowSetDarkTheme();
      }
    }
  });

  function setTheme(next: Theme): void {
    theme.value = next === "light" ? "light" : "dark";
  }

  return {
    theme,
    monacoThemeName,
    setTheme,
  };
});
