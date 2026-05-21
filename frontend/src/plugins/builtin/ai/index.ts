import { defineComponent, h, watch } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import { useAIPanelStore } from "@/stores/aiPanel";
import { useAIConfigStore } from "@/stores/aiConfig";
import { useAIChatStore } from "@/stores/aiChat";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useUiStore } from "@/stores/ui";
import AISettingsModal from "@/components/AISettingsModal.vue";
import AISidePanelHost from "./AISidePanelHost.vue";

const PLUGIN_ID = "textmind.ai";
const SIDE_PANEL_ID = "textmind.ai.chat";
const SETTINGS_MODAL_ID = "textmind.ai.settings";

export const aiPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "AI Assistant",
    version: "1.0.0",
    builtin: true,
    description: "OpenAI-compatible chat panel & inline rewrite.",
  },
  async activate(ctx: PluginContext) {
    const panel = useAIPanelStore();
    const cfg = useAIConfigStore();
    const chat = useAIChatStore();
    const tabs = useTabsStore();
    const menus = useMenusStore();
    const ui = useUiStore();

    // ---- Side panel ----
    ctx.sidePanels.register({
      id: SIDE_PANEL_ID,
      title: "AI",
      position: "right",
      defaultWidth: 380,
      component: AISidePanelHost,
    });

    // The legacy panel store still owns its visibility flag (for persistence
    // and the resize splitter). Bridge it to the registry so dynamic hosts
    // render in sync.
    watch(
      () => panel.visible,
      (v) => ctx.sidePanels.setVisible(SIDE_PANEL_ID, v),
      { immediate: true },
    );

    // ---- Commands ----
    ctx.commands.register({
      id: "ai.togglePanel",
      title: "切换 AI 面板",
      category: "AI",
      defaultKeybinding: "Ctrl+L",
      handler: () => {
        panel.toggleVisible();
        if (panel.visible) {
          if (!cfg.loaded) cfg.load().catch(() => {});
          chat.loadList().catch(() => {});
        }
        setTimeout(() => tabs.adapter?.forceRefresh(), 0);
      },
    });

    ctx.commands.register({
      id: "ai.insertSelection",
      title: "插入选中文本到 AI 对话框",
      category: "AI",
      handler: () => {
        menus.closeEverything();
        const sel = tabs.getSelectionText();
        if (!sel.trim()) {
          ui.showTip("没有选中文本");
          return;
        }
        panel.setVisible(true);
        panel.setPendingInput(sel);
      },
    });

    ctx.commands.register({
      id: "ai.openSettings",
      title: "AI 设置",
      category: "AI",
      bindable: false,
      handler: () => {
        menus.closeEverything();
        ctx.ui.openModal({
          id: SETTINGS_MODAL_ID,
          component: AISettingsModal,
          props: {
            visible: true,
            onClose: () => ctx.ui.closeModal(SETTINGS_MODAL_ID),
          },
        });
      },
    });

    // ---- Menu contributions ----
    ctx.menus.registerItem({
      id: "settings.menu.ai",
      menu: "topbar.settings",
      group: "b-ai",
      order: 20,
      separatorBefore: true,
      label: "AI 设置",
      commandId: "ai.openSettings",
    });

    ctx.menus.registerItem({
      id: "ctx.ai.insertSelection",
      menu: "editor.context",
      group: "c-ai",
      order: 10,
      separatorBefore: true,
      label: "插入到 AI 对话框",
      commandId: "ai.insertSelection",
    });

    // ---- Status bar: AI toggle button ----
    // Inline component avoids creating another file.
    const AIToggle = defineComponent({
      name: "AIToggleButton",
      setup() {
        return () =>
          h(
            "button",
            {
              class: "h-7 px-2.5 text-[13px] cursor-pointer rounded-sm border",
              style: panel.visible
                ? {
                    background: "var(--active-row-bg)",
                    borderColor: "var(--accent)",
                    color: "var(--text)",
                  }
                : {
                    background: "transparent",
                    borderColor: "var(--hairline)",
                    color: "var(--muted)",
                  },
              title: "切换 AI 面板 (Ctrl+L)",
              onClick: () => void ctx.commands.execute("ai.togglePanel"),
            },
            "AI",
          );
      },
    });
    ctx.statusBar.register({
      id: "ai.toggle",
      align: "right",
      order: 100,
      component: AIToggle,
    });
  },
};
