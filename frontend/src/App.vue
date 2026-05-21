<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import TopBar from "@/components/TopBar.vue";
import TabBar from "@/components/TabBar.vue";
import EditorHost from "@/components/EditorHost.vue";
import FileExplorer from "@/components/FileExplorer.vue";
import ExplorerSplitter from "@/components/ExplorerSplitter.vue";
import BottomBar from "@/components/BottomBar.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import TabContextMenu from "@/components/TabContextMenu.vue";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useWorkspaceStore } from "@/stores/workspace";
import { backend } from "@/api/backend";
import {
  installSessionAutoSave,
  loadSessionIntoStores,
} from "@/composables/useSession";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useShortcutsStore } from "@/stores/shortcuts";
import { bootstrapPlugins } from "@/plugins/bootstrap";
import { commandRegistry, modalLayer } from "@/plugins/core";
import PluginModals from "@/plugins/core/hosts/PluginModals.vue";
import PluginSidePanels from "@/plugins/core/hosts/PluginSidePanels.vue";

const tabs = useTabsStore();
const menus = useMenusStore();
const workspace = useWorkspaceStore();
const shortcutsStore = useShortcutsStore();
const { tabs: tabList } = storeToRefs(tabs);

function onAppClick(ev: MouseEvent) {
  menus.closeEditorContextMenu();
  menus.closeTabContextMenu();
  const target = ev.target as HTMLElement | null;
  if (!target?.closest("[data-menu-root]")) {
    menus.closeAllTopMenus();
  }
}

useKeyboardShortcuts({
  onEscape: () => {
    if (modalLayer.list().length > 0) {
      // Close the top-most modal only.
      const top = modalLayer.top();
      if (top) modalLayer.close(top.id);
      return;
    }
    menus.closeEverything();
  },
});

async function openLaunchFileIfAny() {
  const path = await backend.consumeLaunchPath();
  if (!path) return;
  await commandRegistry.execute("file.openByPath", path);
}

onMounted(async () => {
  // Register every built-in plugin before loading the keymap; defaults
  // emitted by plugin activate() need to exist when the keymap merges.
  await bootstrapPlugins();
  await loadSessionIntoStores();
  await shortcutsStore.loadFromBackend();
  if (workspace.root) {
    await workspace.setRoot(workspace.root);
  }
  await openLaunchFileIfAny();
  installSessionAutoSave();
});
</script>

<template>
  <TopBar data-menu-root />
  <div
    class="workbench flex flex-1 min-h-0 overflow-hidden"
    @click="onAppClick"
  >
    <FileExplorer
      @open-file="(p) => commandRegistry.execute('file.openByPath', p)"
    />
    <ExplorerSplitter />
    <PluginSidePanels position="left" />
    <div class="editor-pane flex-1 min-w-0 min-h-0 flex flex-col">
      <TabBar />
      <EditorHost />
    </div>
    <PluginSidePanels position="right" />
  </div>
  <BottomBar />
  <ContextMenu />
  <TabContextMenu />
  <PluginModals />
  <div class="sr-only">{{ tabList.length }}</div>
</template>
