import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";
import type { Theme } from "@/types";
import { getMonacoThemeName } from "@/composables/useMonaco";

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

  // Map each app theme to its dedicated Monaco palette (defined in
  // useMonaco.ts:defineMonacoThemes). We used to collapse this into a single
  // light/dark pair, but that left e.g. 羊皮卷 (light) showing the dark
  // tiny-minimal background and 夜樱's lavender panels next to a near-black
  // editor square. Routing through getMonacoThemeName keeps EditorHost and
  // TextDiffModal in lockstep with whatever the store decides.
  const monacoThemeName = computed(() => getMonacoThemeName(theme.value));

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
