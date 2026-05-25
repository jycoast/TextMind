import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";
import type { Theme } from "@/types";

const THEME_STORAGE_KEY = "TextMind.theme";

// Single source of truth for the list of valid theme ids. Anything not in
// this set falls back to the default dark theme. The textmind.theme plugin
// drives the user-visible PRESETS list; this set must stay in sync (it's
// effectively `Set<Theme>` minus the type-only constraint).
const VALID_THEMES = new Set<Theme>(["dark", "light", "sakura", "parchment"]);

// Themes whose palette is conceptually "light mode" (bright background,
// dark text). Used to pick the right Monaco editor theme and to ask Wails
// to switch the native window chrome between light/dark. Anything not in
// this set is treated as a dark theme.
const LIGHT_THEMES = new Set<Theme>(["light", "parchment"]);

function isLightTheme(t: Theme): boolean {
  return LIGHT_THEMES.has(t);
}

function loadInitialTheme(): Theme {
  try {
    const raw = String(
      window.localStorage.getItem(THEME_STORAGE_KEY) || "",
    ).toLowerCase() as Theme;
    return VALID_THEMES.has(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export const useThemeStore = defineStore("theme", () => {
  const theme = ref<Theme>(loadInitialTheme());

  // Monaco only ships two custom themes (tiny-light / tiny-minimal). Every
  // "light-mode" theme reuses tiny-light, every "dark-mode" theme reuses
  // tiny-minimal. The web-app palette is governed entirely by body[data-theme]
  // CSS variables, so the Monaco theme only needs to match the overall
  // light/dark intent, not the exact accent color.
  const monacoThemeName = computed(() =>
    isLightTheme(theme.value) ? "tiny-light" : "tiny-minimal",
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
      if (isLightTheme(theme.value) && typeof runtime.WindowSetLightTheme === "function") {
        runtime.WindowSetLightTheme();
      } else if (
        !isLightTheme(theme.value) &&
        typeof runtime.WindowSetDarkTheme === "function"
      ) {
        runtime.WindowSetDarkTheme();
      }
    }
  });

  function setTheme(next: Theme): void {
    theme.value = VALID_THEMES.has(next) ? next : "dark";
  }

  return {
    theme,
    monacoThemeName,
    setTheme,
  };
});
