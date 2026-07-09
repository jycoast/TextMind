import { defineComponent, h, ref, computed, watch } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import { commandRegistry, type CommandRecord } from "@/plugins/core";
import { useWorkspaceStore } from "@/stores/workspace";
import { useMenusStore } from "@/stores/menus";
import { useSidebarStore } from "@/stores/sidebar";
import { backend } from "@/api/backend";
import CommandPalette from "@/components/CommandPalette.vue";
import type { PaletteItem } from "@/components/CommandPalette.vue";
import SearchPanel from "@/components/SearchPanel.vue";

const PLUGIN_ID = "textmind.command-palette";

interface FileEntry {
  name: string;
  path: string;
  relative: string;
}

export const commandPalettePlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "Command Palette & Search",
    version: "1.0.0",
    builtin: true,
    description: "Command palette, quick open, and global search.",
  },
  async activate(ctx: PluginContext) {
    const menus = useMenusStore();
    const workspace = useWorkspaceStore();
    const sidebar = useSidebarStore();

    // Register search panel in sidebar
    sidebar.register({
      id: "search",
      icon: "search",
      title: "搜索",
      order: 20,
      component: SearchPanel,
    });

    // Shared reactive state for the palette overlay
    const paletteVisible = ref(false);
    const paletteMode = ref<"commands" | "files">("commands");
    const fileCache = ref<FileEntry[]>([]);
    const fileCacheRoot = ref("");

    const paletteItems = computed<PaletteItem[]>(() => {
      if (paletteMode.value === "commands") {
        return commandRegistry.list().map((cmd: CommandRecord) => ({
          id: cmd.id,
          label: cmd.title,
          category: cmd.category,
          keybinding: cmd.defaultKeybinding,
        }));
      }
      return fileCache.value.map((f) => ({
        id: f.path,
        label: f.name,
        detail: f.relative,
      }));
    });

    const palettePlaceholder = computed(() =>
      paletteMode.value === "commands"
        ? "输入命令名称..."
        : "输入文件名...",
    );

    async function loadFileCache() {
      if (!workspace.root) return;
      if (fileCacheRoot.value === workspace.root && fileCache.value.length > 0) {
        return;
      }
      try {
        const res = await backend.listAllFiles(workspace.root);
        if (res.files) {
          fileCache.value = res.files;
          fileCacheRoot.value = workspace.root;
        }
      } catch {
        // silently fail
      }
    }

    function onSelect(item: PaletteItem) {
      paletteVisible.value = false;
      if (paletteMode.value === "commands") {
        commandRegistry.execute(item.id);
      } else {
        commandRegistry.execute("file.openByPath", item.id);
      }
    }

    function onClose() {
      paletteVisible.value = false;
    }

    // ---- Commands ----
    ctx.commands.register({
      id: "palette.open",
      title: "命令面板",
      category: "导航",
      defaultKeybinding: "Ctrl+Shift+P",
      handler: () => {
        menus.closeEverything();
        paletteMode.value = "commands";
        paletteVisible.value = true;
      },
    });

    ctx.commands.register({
      id: "palette.quickOpen",
      title: "快速打开文件",
      category: "导航",
      defaultKeybinding: "Ctrl+P",
      handler: async () => {
        menus.closeEverything();
        if (!workspace.root) {
          ctx.ui.showTip("请先打开一个工作区文件夹");
          return;
        }
        paletteMode.value = "files";
        await loadFileCache();
        paletteVisible.value = true;
      },
    });

    ctx.commands.register({
      id: "search.togglePanel",
      title: "全局搜索",
      category: "导航",
      defaultKeybinding: "Ctrl+Shift+F",
      handler: () => {
        menus.closeEverything();
        sidebar.toggle("search");
      },
    });

    // Invalidate file cache when workspace changes
    watch(
      () => workspace.root,
      () => {
        fileCache.value = [];
        fileCacheRoot.value = "";
      },
    );

    // ---- Menu contributions ----
    ctx.menus.registerItem({
      id: "edit.menu.commandPalette",
      menu: "topbar.edit",
      group: "c-nav",
      order: 100,
      separatorBefore: true,
      label: "命令面板",
      commandId: "palette.open",
    });

    ctx.menus.registerItem({
      id: "file.menu.quickOpen",
      menu: "topbar.file",
      group: "b-open",
      order: 30,
      label: "快速打开文件",
      commandId: "palette.quickOpen",
    });

    ctx.menus.registerItem({
      id: "edit.menu.search",
      menu: "topbar.edit",
      group: "c-nav",
      order: 110,
      label: "全局搜索",
      commandId: "search.togglePanel",
    });

    // ---- Palette Host Component ----
    const PaletteHost = defineComponent({
      name: "PaletteHost",
      setup() {
        return () =>
          h(CommandPalette, {
            visible: paletteVisible.value,
            items: paletteItems.value,
            placeholder: palettePlaceholder.value,
            onSelect,
            onClose,
          });
      },
    });

    ctx.statusBar.register({
      id: "palette.host",
      align: "right",
      order: -1000,
      component: PaletteHost,
    });
  },
};
