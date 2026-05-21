import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useUiStore } from "@/stores/ui";
import { backend } from "@/api/backend";
import ExtractModal from "@/components/ExtractModal.vue";
import TemplateModal from "@/components/TemplateModal.vue";

const PLUGIN_ID = "textmind.text-tools";
const EXTRACT_MODAL_ID = "textmind.text-tools.extract";
const TEMPLATE_MODAL_ID = "textmind.text-tools.template";

export const textToolsPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Text Tools",
    version: "1.0.0",
    builtin: true,
    description: "Dedupe / extract / IN-list / template tools.",
  },
  async activate(ctx: PluginContext) {
    const tabs = useTabsStore();
    const menus = useMenusStore();
    const ui = useUiStore();

    const runDedupe = async (action: "dedupe" | "singleton" | "duplicates" | "inlist") => {
      const selected = tabs.getSelectionText();
      if (!selected.trim()) return;
      if (action === "dedupe") {
        const res = await backend.dedupeSelected(selected);
        if (res?.text != null) {
          tabs.replaceSelection(res.text);
          const removed = Number(res.removed) || 0;
          const msg = `去重完成，去重 ${removed} 条`;
          ui.showTip(msg);
          ui.showCenterNotice(msg);
        }
      } else if (action === "singleton") {
        const res = await backend.keepSingletonSelected(selected);
        if (res?.text != null) tabs.replaceSelection(res.text);
      } else if (action === "duplicates") {
        const res = await backend.keepDuplicateSelected(selected);
        if (res?.text != null) tabs.replaceSelection(res.text);
      } else if (action === "inlist") {
        const res = await backend.toInListSelected(selected);
        if (res?.text != null) tabs.replaceSelection(res.text);
      }
    };

    ctx.commands.register({
      id: "text.dedupe",
      title: "去重",
      category: "文本工具",
      handler: () => runDedupe("dedupe"),
    });
    ctx.commands.register({
      id: "text.singleton",
      title: "保留单次出现项",
      category: "文本工具",
      handler: () => runDedupe("singleton"),
    });
    ctx.commands.register({
      id: "text.duplicates",
      title: "保留重复项",
      category: "文本工具",
      handler: () => runDedupe("duplicates"),
    });
    ctx.commands.register({
      id: "text.inlist",
      title: "转 IN 列表",
      category: "文本工具",
      handler: () => runDedupe("inlist"),
    });

    ctx.commands.register({
      id: "text.extract",
      title: "提取文本",
      category: "文本工具",
      handler: () => {
        menus.closeEverything();
        const sel = tabs.getSelectionText();
        const source = sel.trim() ? sel : tabs.adapter?.getValue() ?? "";
        if (!source.trim()) {
          ui.showTip("没有可提取的文本");
          return;
        }
        ctx.ui.openModal({
          id: EXTRACT_MODAL_ID,
          component: ExtractModal,
          props: {
            visible: true,
            source,
            onInsert: (text: string) => {
              const ok = tabs.replaceSelection(text);
              if (!ok) {
                ui.showTip('当前没有选区可替换，请改用"新建Tab输出"');
                return;
              }
              ctx.ui.closeModal(EXTRACT_MODAL_ID);
              ui.showTip("提取完成");
            },
            onNewTab: (text: string) => {
              tabs.addTabFromText("提取结果", text, "plaintext");
              ctx.ui.closeModal(EXTRACT_MODAL_ID);
              ui.showTip("提取完成");
            },
            onClose: () => ctx.ui.closeModal(EXTRACT_MODAL_ID),
          },
        });
      },
    });

    ctx.commands.register({
      id: "edit.templateSql",
      title: "模板批量生成",
      category: "文本工具",
      defaultKeybinding: "Ctrl+Shift+G",
      handler: () => {
        menus.closeEverything();
        const sel = tabs.getSelectionText();
        const initialData = sel.trim() ? sel : "";
        ctx.ui.openModal({
          id: TEMPLATE_MODAL_ID,
          component: TemplateModal,
          props: {
            visible: true,
            initialData,
            onInsert: (text: string) => {
              const ok = tabs.replaceSelection(text);
              if (!ok) {
                ui.showTip('当前没有选区可替换，请改用"新建Tab输出"');
                return;
              }
              ctx.ui.closeModal(TEMPLATE_MODAL_ID);
              ui.showTip("批量生成完成");
            },
            onNewTab: (text: string) => {
              tabs.addTabFromText("批量SQL结果", text, "sql");
              ctx.ui.closeModal(TEMPLATE_MODAL_ID);
              ui.showTip("批量生成完成");
            },
            onClose: () => ctx.ui.closeModal(TEMPLATE_MODAL_ID),
          },
        });
      },
    });

    // Editor context menu items
    ctx.menus.registerItem({
      id: "ctx.text.extract",
      menu: "editor.context",
      group: "a-text",
      order: 10,
      label: "提取文本",
      commandId: "text.extract",
    });
    ctx.menus.registerItem({
      id: "ctx.text.dedupe",
      menu: "editor.context",
      group: "a-text",
      order: 20,
      label: "去重",
      commandId: "text.dedupe",
    });
    ctx.menus.registerItem({
      id: "ctx.text.singleton",
      menu: "editor.context",
      group: "a-text",
      order: 30,
      label: "保留单次出现项",
      commandId: "text.singleton",
    });
    ctx.menus.registerItem({
      id: "ctx.text.duplicates",
      menu: "editor.context",
      group: "a-text",
      order: 40,
      label: "保留重复项",
      commandId: "text.duplicates",
    });
    ctx.menus.registerItem({
      id: "ctx.text.inlist",
      menu: "editor.context",
      group: "a-text",
      order: 50,
      label: "转 IN 列表",
      commandId: "text.inlist",
    });

    // Edit topbar menu item
    ctx.menus.registerItem({
      id: "edit.menu.template",
      menu: "topbar.edit",
      group: "b",
      order: 20,
      label: "模板批量生成",
      commandId: "edit.templateSql",
    });
  },
};
