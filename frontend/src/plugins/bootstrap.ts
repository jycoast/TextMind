import type { EditorAdapter, Tab } from "@/types";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { pluginManager, type PluginUIAdapter } from "@/plugins/core";
import { builtinPlugins } from "@/plugins/builtin";
import { discoverAndLoadExternalPlugins } from "@/plugins/external/loader";

let bootstrapped = false;

/**
 * Wire the plugin manager to the global stores, register built-in plugins,
 * fire onStartup, then discover & load external plugins from disk. The
 * external loader is best-effort; a broken plugin never aborts startup.
 */
export async function bootstrapPlugins(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  const tabs = useTabsStore();
  const ui = useUiStore();
  const adapter: PluginUIAdapter = {
    getActiveAdapter: (): EditorAdapter | null => tabs.adapter,
    getActiveTab: (): Tab | null => tabs.current,
    showTip: (msg) => ui.showTip(msg),
    showCenterNotice: (msg) => ui.showCenterNotice(msg),
  };
  pluginManager.setUIAdapter(adapter);

  for (const plugin of builtinPlugins) {
    pluginManager.register(plugin);
  }

  await pluginManager.fire("onStartup");

  // External plugins are async; defer to next tick so the UI paints first.
  void discoverAndLoadExternalPlugins().catch((err) => {
    console.warn("[plugins] external load failed:", err);
  });
}
