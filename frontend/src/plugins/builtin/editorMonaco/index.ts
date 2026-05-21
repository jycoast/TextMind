import type { Plugin, PluginContext } from "@/plugins/core";
import { createMonacoAdapter, defineMonacoThemes } from "@/composables/useMonaco";

const PLUGIN_ID = "textmind.editor.monaco";

export const editorMonacoPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Monaco Editor",
    version: "1.0.0",
    builtin: true,
    description: "Default code editor powered by Monaco.",
  },
  async activate(ctx: PluginContext) {
    defineMonacoThemes();

    ctx.editor.registerEditor({
      id: "monaco",
      displayName: "Monaco (Source)",
      priority: 0,
      match: () => true,
      factory: (host, createCtx) =>
        createMonacoAdapter({ host, initialTheme: createCtx.initialTheme }),
    });
  },
};
