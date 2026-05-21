import { storeToRefs } from "pinia";
import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useRecentStore } from "@/stores/recent";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { backend } from "@/api/backend";
import { guessLanguageByFilename } from "@/composables/useLanguageGuess";
import { pathBaseName } from "@/utils/normalize";
import SaveAsEncodingModal from "@/components/SaveAsEncodingModal.vue";

const PLUGIN_ID = "textmind.files";
const SAVE_AS_MODAL_ID = "textmind.files.saveAs";

const manifest = {
  id: PLUGIN_ID,
  name: "Files & Workspace",
  version: "1.0.0",
  builtin: true,
  description: "File I/O, recent files list, workspace folder, theme.",
} as const;

async function openFileByPath(path: string, _ctx: PluginContext) {
  const p = String(path || "").trim();
  if (!p) return;
  const ui = useUiStore();
  const tabs = useTabsStore();
  const recents = useRecentStore();
  const menus = useMenusStore();
  menus.closeAllTopMenus();
  const res = await backend.openTextFileByPath(p);
  if (!res) return;
  if (res.error) {
    ui.showTip(res.error);
    recents.remove(p);
    return;
  }
  if (!res.path) return;
  const result = tabs.openFileResultToTab(res);
  recents.push(res.path, res.name, guessLanguageByFilename(res.name || res.path));
  if (result?.reloaded) ui.showTip(`已重新加载 ${res.name || "文件"}`);
  else if (result?.existed) ui.showTip(`文件已打开，已切换到 ${res.name || "对应Tab"}`);
  else ui.showTip(`已打开 ${res.name || "文件"}`);
}

export const filesPlugin: Plugin = {
  manifest: { ...manifest },
  async activate(ctx: PluginContext) {
    const tabs = useTabsStore();
    const menus = useMenusStore();
    const recents = useRecentStore();
    const workspace = useWorkspaceStore();
    const ui = useUiStore();
    const themeStore = useThemeStore();

    // ---- Commands ----
    ctx.commands.register({
      id: "file.save",
      title: "保存",
      category: "文件",
      defaultKeybinding: "Ctrl+S",
      handler: async () => {
        menus.closeAllTopMenus();
        const r = await tabs.saveCurrent();
        if (r.error) {
          ui.showTip(r.error);
          return;
        }
        if (r.ok) ui.showTip(`已保存 ${r.name || ""}`);
      },
    });

    ctx.commands.register({
      id: "file.saveAs",
      title: "另存为",
      category: "文件",
      handler: () => {
        menus.closeAllTopMenus();
        if (!tabs.current) {
          ui.showTip("没有可保存的标签页");
          return;
        }
        ctx.ui.openModal({
          id: SAVE_AS_MODAL_ID,
          component: SaveAsEncodingModal,
          props: {
            visible: true,
            initialEncoding: tabs.current.encoding,
            initialHasBOM: tabs.current.hasBOM,
            onConfirm: async (payload: { encoding: string; withBOM: boolean }) => {
              ctx.ui.closeModal(SAVE_AS_MODAL_ID);
              const r = await tabs.saveCurrentAs(payload.encoding, payload.withBOM);
              if (r.error) ui.showTip(r.error);
              else if (r.ok) ui.showTip(`已保存 ${r.name || ""}`);
            },
            onClose: () => ctx.ui.closeModal(SAVE_AS_MODAL_ID),
          },
        });
      },
    });

    ctx.commands.register({
      id: "file.openFile",
      title: "打开文件",
      category: "文件",
      handler: async () => {
        menus.closeAllTopMenus();
        const res = await backend.openTextFile();
        if (!res) return;
        if (res.error) {
          ui.showTip(res.error);
          return;
        }
        if (!res.path) return;
        const result = tabs.openFileResultToTab(res);
        recents.push(res.path, res.name, guessLanguageByFilename(res.name || res.path));
        if (result?.reloaded) ui.showTip(`已重新加载 ${res.name || "文件"}`);
        else if (result?.existed) ui.showTip(`文件已打开，已切换到 ${res.name || "对应Tab"}`);
        else ui.showTip(`已打开 ${res.name || "文件"}`);
      },
    });

    ctx.commands.register({
      id: "file.openFolder",
      title: "打开文件夹",
      category: "文件",
      handler: async () => {
        menus.closeAllTopMenus();
        const res = await backend.openFolder();
        if (!res) return;
        if (res.error) {
          ui.showTip(res.error);
          return;
        }
        if (!res.path) return;
        await workspace.setRoot(res.path);
        ui.showTip(`已打开文件夹 ${pathBaseName(res.path) || res.path}`);
      },
    });

    ctx.commands.register({
      id: "file.openByPath",
      title: "打开指定路径",
      category: "文件",
      bindable: false,
      handler: async (path: unknown) => openFileByPath(String(path || ""), ctx),
    });

    ctx.commands.register({
      id: "edit.toggleColumn",
      title: "列编辑",
      category: "编辑",
      defaultKeybinding: "Ctrl+Alt+L",
      handler: () => {
        const { ok, applied } = tabs.toggleColumnMode();
        if (!ok && applied) ui.showTip("仅 Monaco 支持列编辑");
      },
    });

    ctx.commands.register({
      id: "edit.find",
      title: "查找",
      category: "编辑",
      defaultKeybinding: "Ctrl+F",
      handler: () => {
        const adapter = tabs.adapter;
        if (!adapter) {
          ui.showTip("没有打开的编辑器");
          return;
        }
        if (typeof adapter.triggerFind !== "function") {
          ui.showTip("当前编辑器不支持查找");
          return;
        }
        const opened = adapter.triggerFind();
        if (!opened) ui.showTip("编辑器尚未就绪");
      },
    });

    ctx.commands.register({
      id: "edit.detectLanguage",
      title: "自动识别语言",
      category: "编辑",
      handler: () => {
        menus.closeEverything();
        const res = tabs.detectAndApplyCurrentLanguage();
        if (!res.ok) ui.showTip("未能识别出语言");
        else ui.showTip(`已切换语言：${res.language}`);
      },
    });

    ctx.commands.register({
      id: "theme.setDark",
      title: "切换至深色主题",
      category: "外观",
      bindable: false,
      handler: () => themeStore.setTheme("dark"),
    });

    ctx.commands.register({
      id: "theme.setLight",
      title: "切换至浅色主题",
      category: "外观",
      bindable: false,
      handler: () => themeStore.setTheme("light"),
    });

    // ---- Top menus ----
    ctx.menus.registerTopMenu({ id: "file", label: "文件", order: 10 });
    ctx.menus.registerTopMenu({ id: "edit", label: "编辑", order: 20 });
    ctx.menus.registerTopMenu({ id: "settings", label: "设置", order: 90 });

    // ---- File menu items ----
    ctx.menus.registerItem({
      id: "file.menu.save",
      menu: "topbar.file",
      group: "a-io",
      order: 10,
      label: "保存",
      commandId: "file.save",
    });
    ctx.menus.registerItem({
      id: "file.menu.saveAs",
      menu: "topbar.file",
      group: "a-io",
      order: 20,
      label: "另存为...",
      commandId: "file.saveAs",
    });
    ctx.menus.registerItem({
      id: "file.menu.openFile",
      menu: "topbar.file",
      group: "a-io",
      order: 30,
      label: "打开文件...",
      commandId: "file.openFile",
    });
    ctx.menus.registerItem({
      id: "file.menu.openFolder",
      menu: "topbar.file",
      group: "a-io",
      order: 40,
      label: "打开文件夹...",
      commandId: "file.openFolder",
    });

    // Recent files submenu - rendered as a custom component via a synthetic
    // command. We slot it in by registering a side panel-style item.
    const recentHostId = "file.menu.recent";
    ctx.menus.registerItem({
      id: recentHostId,
      menu: "topbar.file",
      group: "b-recent",
      separatorBefore: true,
      order: 50,
      label: "最近打开文件 ›",
      commandId: "file.openRecentMenu",
    });
    // command to inline open recent submenu; opens a popover modal for now
    ctx.commands.register({
      id: "file.openRecentMenu",
      title: "最近打开文件",
      category: "文件",
      bindable: false,
      handler: () => {
        // toggle dropdown - approximate by listing top recent via center notice
        const list = recents.files.slice(0, 5);
        if (list.length === 0) {
          ui.showTip("尚无最近打开文件");
          return;
        }
        ui.showTip(`最近: ${list.map((f) => f.name).join(" | ")}`);
      },
    });

    // ---- Edit menu items ----
    ctx.menus.registerItem({
      id: "edit.menu.toggleColumn",
      menu: "topbar.edit",
      group: "a",
      order: 10,
      label: () => {
        const { adapter, columnMode } = storeToRefs(tabs);
        const supported = Boolean(adapter.value?.supportsColumnMode);
        return columnMode.value && supported ? "列编辑  (已开启)" : "列编辑";
      },
      enabled: () => Boolean(tabs.adapter?.supportsColumnMode),
      commandId: "edit.toggleColumn",
    });
    ctx.menus.registerItem({
      id: "edit.menu.detectLanguage",
      menu: "topbar.edit",
      group: "b",
      order: 30,
      label: "自动识别语言",
      commandId: "edit.detectLanguage",
    });

    // ---- Settings menu: theme entry (the rest is contributed by other plugins) ----
    ctx.commands.register({
      id: "theme.toggle",
      title: "主题切换",
      category: "外观",
      bindable: false,
      handler: () => {
        const cur = useThemeStore().theme;
        useThemeStore().setTheme(cur === "dark" ? "light" : "dark");
      },
    });
    ctx.menus.registerItem({
      id: "settings.menu.theme",
      menu: "topbar.settings",
      group: "a-theme",
      order: 10,
      label: () => `主题: ${useThemeStore().theme === "dark" ? "深色" : "浅色"}`,
      commandId: "theme.toggle",
    });
  },
};
