import type { Plugin, PluginContext } from "@/plugins/core";
import { useMenusStore } from "@/stores/menus";
import { useShortcutsStore } from "@/stores/shortcuts";
import ShortcutsModal from "@/components/ShortcutsModal.vue";

const PLUGIN_ID = "textmind.shortcuts";
const MODAL_ID = "textmind.shortcuts.modal";

export const shortcutsPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Keyboard Shortcuts",
    version: "1.0.0",
    builtin: true,
    description: "Bind commands to key combos.",
    dependencies: [],
  },
  async activate(ctx: PluginContext) {
    const menus = useMenusStore();
    const shortcuts = useShortcutsStore();

    ctx.commands.register({
      id: "shortcuts.open",
      title: "快捷键设置",
      category: "应用",
      bindable: false,
      handler: () => {
        menus.closeEverything();
        ctx.ui.openModal({
          id: MODAL_ID,
          component: ShortcutsModal,
          props: {
            visible: true,
            onClose: () => ctx.ui.closeModal(MODAL_ID),
          },
        });
      },
    });

    ctx.menus.registerItem({
      id: "settings.menu.shortcuts",
      menu: "topbar.settings",
      group: "b-ai",
      order: 30,
      label: "快捷键设置",
      commandId: "shortcuts.open",
    });

    // Once all plugins have registered their commands, reload bindings so any
    // newly-registered defaults are picked up. The shortcuts store is loaded
    // first in App.vue's mount; this call merges any defaults that appeared
    // after that initial load.
    shortcuts.ensureDefaults();
  },
};
