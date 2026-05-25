// Theme plugin.
//
// Owns every command and menu entry related to switching the application's
// visual theme. The actual palettes live in src/styles/base.css; this plugin
// only flips body[data-theme] via the shared Pinia store (useThemeStore),
// which already handles persistence (localStorage["TextMind.theme"]),
// Monaco theme name mapping and the Wails native window light/dark toggle.
//
// Why a dedicated plugin instead of keeping the toggle inside the files
// plugin: theme is an orthogonal concern and we want a single hover-flyout
// submenu under "设置" that lists every preset with a clear selection marker,
// rather than a single label-toggling menu item.

import type {
  Plugin,
  PluginContext,
  SubmenuItem,
} from "@/plugins/core";
import { useThemeStore } from "@/stores/theme";
import type { Theme } from "@/types";

const PLUGIN_ID = "textmind.theme";

interface ThemePreset {
  id: Theme;
  label: string;
  description: string;
}

// Built-in palettes. The order here drives both the submenu order and the
// cycle order used by the `theme.toggle` command. Palette values live in
// styles/base.css; useThemeStore decides Monaco theme + Wails native chrome
// based on whether the id is registered in LIGHT_THEMES.
const PRESETS: readonly ThemePreset[] = [
  {
    id: "dark",
    label: "墨夜 (深色)",
    description: "深蓝灰底 + 暖白文字 + 青蓝强调",
  },
  {
    id: "light",
    label: "晨纸 (浅色)",
    description: "纯白底 + 深炭文字 + GitHub 蓝强调",
  },
  {
    id: "sakura",
    label: "夜樱 (深色)",
    description: "Dracula 风：板岩紫底 + 樱粉 / 鸢尾紫强调",
  },
  {
    id: "parchment",
    label: "羊皮卷 (浅色)",
    description: "Solarized Light 风：暖米黄底 + 经典蓝强调，护眼",
  },
];

export const themePlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Theme",
    version: "1.0.0",
    builtin: true,
    description: "内置浅色 / 深色主题切换。",
  },
  activate(ctx: PluginContext) {
    const themeStore = useThemeStore();

    for (const preset of PRESETS) {
      ctx.commands.register({
        id: `theme.set.${preset.id}`,
        title: `主题：${preset.label}`,
        category: "外观",
        // Setter commands are reachable from the submenu; keep them out of
        // the shortcut binding panel to avoid bloating it with N entries.
        bindable: false,
        handler: () => themeStore.setTheme(preset.id),
      });
    }

    // Toggle command is bindable so power users can map a single shortcut
    // (e.g. Ctrl+Alt+T) to step through presets. Cycles in PRESETS order;
    // unknown current theme falls through to the first preset.
    ctx.commands.register({
      id: "theme.toggle",
      title: "切换主题（循环下一个）",
      category: "外观",
      bindable: true,
      handler: () => {
        const idx = PRESETS.findIndex((p) => p.id === themeStore.theme);
        const next = PRESETS[(idx + 1) % PRESETS.length];
        themeStore.setTheme(next.id);
      },
    });

    // Settings → 主题 → (深色 / 浅色). The submenuProvider runs every time
    // the user hovers the parent (see DynamicMenu.vue), so the ●/○ marker
    // always reflects the currently active preset without a reactive watch.
    ctx.menus.registerItem({
      id: "settings.menu.theme",
      menu: "topbar.settings",
      group: "a-theme",
      order: 10,
      label: "主题",
      submenuProvider: (): SubmenuItem[] =>
        PRESETS.map((preset) => ({
          id: `theme.preset.${preset.id}`,
          label: `${themeStore.theme === preset.id ? "●" : "○"}  ${preset.label}`,
          title: preset.description,
          commandId: `theme.set.${preset.id}`,
        })),
    });
  },
};
