import type { Plugin, PluginContext } from "@/plugins/core";
import { useUpdateStore } from "@/stores/update";
import { useMenusStore } from "@/stores/menus";
import UpdateModal from "@/components/UpdateModal.vue";

const PLUGIN_ID = "textmind.updater";
const MODAL_ID = "textmind.updater.modal";

// 24h between auto-checks; explicit user clicks always force a fresh check.
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Wait a few seconds after launch before going to the network so the editor
// finishes loading first. Network failures are silent.
const AUTO_CHECK_DELAY_MS = 8000;

export const updaterPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Auto Updater",
    version: "1.0.0",
    builtin: true,
    description: "Check & install GitHub releases.",
  },
  async activate(ctx: PluginContext) {
    const updateStore = useUpdateStore();
    const menus = useMenusStore();

    ctx.commands.register({
      id: "app.checkForUpdates",
      title: "检查更新",
      category: "应用",
      bindable: false,
      handler: () => {
        menus.closeEverything();
        ctx.ui.openModal({
          id: MODAL_ID,
          component: UpdateModal,
          props: {
            visible: true,
            onClose: () => ctx.ui.closeModal(MODAL_ID),
          },
        });
      },
    });

    ctx.menus.registerItem({
      id: "settings.menu.checkUpdates",
      menu: "topbar.settings",
      group: "c-update",
      order: 30,
      separatorBefore: true,
      label: "检查更新",
      commandId: "app.checkForUpdates",
    });

    // Schedule a silent auto-check after the editor settles.
    setTimeout(() => {
      void (async () => {
        const last = Number(updateStore.lastCheckMs) || 0;
        if (last && Date.now() - last < AUTO_CHECK_INTERVAL_MS) return;
        try {
          const res = await updateStore.check(true);
          if (res?.hasUpdate) await ctx.commands.execute("app.checkForUpdates");
        } catch {
          /* silent */
        }
      })();
    }, AUTO_CHECK_DELAY_MS);
  },
};
