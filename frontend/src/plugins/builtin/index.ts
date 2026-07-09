import { filesPlugin } from "./files";
import { textToolsPlugin } from "./textTools";
import { jsonPlugin } from "./json";
import { aiPlugin } from "./ai";
import { updaterPlugin } from "./updater";
import { shortcutsPlugin } from "./shortcuts";
import { editorMonacoPlugin } from "./editorMonaco";
import { editorMarkdownPlugin } from "./editorMarkdown";
import { pluginsUiPlugin } from "./pluginsUi";
import { cosUploadPlugin } from "./cosUpload";
import { outlinePlugin } from "./outline";
import { themePlugin } from "./theme";
import { textDiffPlugin } from "./textDiff";
import { commandPalettePlugin } from "./commandPalette";
import type { Plugin } from "@/plugins/core";

/**
 * Static list of built-in plugins. Order is mostly informational - the
 * PluginManager respects manifest.dependencies for activation order. Editor
 * plugins are registered first so the EditorHost has at least one factory
 * available before tabs render.
 */
export const builtinPlugins: Plugin[] = [
  editorMonacoPlugin,
  editorMarkdownPlugin,
  filesPlugin,
  themePlugin,
  textToolsPlugin,
  textDiffPlugin,
  jsonPlugin,
  aiPlugin,
  updaterPlugin,
  shortcutsPlugin,
  pluginsUiPlugin,
  cosUploadPlugin,
  outlinePlugin,
  commandPalettePlugin,
];

export {
  filesPlugin,
  themePlugin,
  textToolsPlugin,
  textDiffPlugin,
  jsonPlugin,
  aiPlugin,
  updaterPlugin,
  shortcutsPlugin,
  editorMonacoPlugin,
  editorMarkdownPlugin,
  pluginsUiPlugin,
  cosUploadPlugin,
  outlinePlugin,
  commandPalettePlugin,
};
