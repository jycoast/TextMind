import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import TextDiffModal from "./TextDiffModal.vue";

const PLUGIN_ID = "textmind.textDiff";
const MODAL_ID = "textmind.textDiff.modal";

// "Text Diff" plugin: opens a full-screen modal hosting a Monaco DiffEditor
// where the user can paste two arbitrary blobs side-by-side. The plugin only
// owns the command + menu wiring; all editor logic lives in TextDiffModal.vue.
export const textDiffPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "文本对比",
    version: "1.0.0",
    builtin: true,
    description: "在左右两栏粘贴文本，实时查看差异（基于 Monaco DiffEditor）",
    activationEvents: ["onStartup"],
  },
  async activate(ctx: PluginContext) {
    ctx.commands.register({
      id: "edit.diff.open",
      title: "文本对比...",
      category: "编辑",
      handler: () => {
        const tabs = useTabsStore();
        const menus = useMenusStore();
        menus.closeEverything?.();

        // Sensible initial fill: if the user has an active selection we put
        // that on the left (the "before") and the entire document on the
        // right (the "after"); otherwise both panes start empty.
        const sel = tabs.getSelectionText?.() ?? "";
        const all = tabs.adapter?.getValue?.() ?? tabs.current?.text ?? "";
        const hasSel = !!sel.trim();
        const initialLeft = hasSel ? sel : "";
        const initialRight = hasSel ? all : "";

        ctx.ui.openModal({
          id: MODAL_ID,
          component: TextDiffModal,
          props: {
            visible: true,
            initialLeft,
            initialRight,
            onClose: () => ctx.ui.closeModal(MODAL_ID),
            onCopyToNewTab: (text: string) => {
              tabs.addTabFromText("对比结果.diff", text, "diff");
              ctx.ui.closeModal(MODAL_ID);
            },
          },
        });
      },
    });

    ctx.menus.registerItem({
      id: "edit.menu.diff",
      menu: "topbar.edit",
      group: "c-diff",
      order: 30,
      separatorBefore: true,
      label: "文本对比...",
      commandId: "edit.diff.open",
    });
  },
};
