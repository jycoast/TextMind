import type { Plugin, PluginContext } from "@/plugins/core";
import { useMenusStore } from "@/stores/menus";
import PluginsModal from "./PluginsModal.vue";

const PLUGIN_ID = "textmind.plugins-ui";
const MODAL_ID = "textmind.plugins-ui.modal";

// The plugin manager is the single entry point for everything plugin-
// related. Per-plugin configuration is reached by clicking the "设置"
// button on a row inside that dialog (only shown for plugins that have
// registered a SettingsPageSpec via ctx.settings.registerPage).
export const pluginsUiPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Plugins Manager",
    version: "1.0.0",
    builtin: true,
    description: "Browse, enable / disable, configure, and uninstall plugins.",
  },
  async activate(ctx: PluginContext) {
    const menus = useMenusStore();

    ctx.commands.register({
      id: "plugins.open",
      title: "插件管理",
      category: "应用",
      bindable: false,
      handler: () => {
        menus.closeEverything();
        ctx.ui.openModal({
          id: MODAL_ID,
          component: PluginsModal,
          props: {
            visible: true,
            onClose: () => ctx.ui.closeModal(MODAL_ID),
          },
        });
      },
    });

    ctx.menus.registerItem({
      id: "settings.menu.plugins",
      menu: "topbar.settings",
      group: "d-plugins",
      order: 40,
      separatorBefore: true,
      label: "插件管理...",
      commandId: "plugins.open",
    });
  },
};
