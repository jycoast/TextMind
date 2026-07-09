<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import TopBar from "@/components/TopBar.vue";
import TabBar from "@/components/TabBar.vue";
import EditorHost from "@/components/EditorHost.vue";
import ActivityBar from "@/components/ActivityBar.vue";
import SidebarContainer from "@/components/SidebarContainer.vue";
import BottomBar from "@/components/BottomBar.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import TabContextMenu from "@/components/TabContextMenu.vue";
import FileChangeBanner from "@/components/FileChangeBanner.vue";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSidebarStore } from "@/stores/sidebar";
import { backend } from "@/api/backend";
import {
  installSessionAutoSave,
  loadSessionIntoStores,
} from "@/composables/useSession";
import { installFileWatcher } from "@/composables/useFileWatcher";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useShortcutsStore } from "@/stores/shortcuts";
import { bootstrapPlugins } from "@/plugins/bootstrap";
import { commandRegistry, modalLayer } from "@/plugins/core";
import PluginModals from "@/plugins/core/hosts/PluginModals.vue";
import PluginSidePanels from "@/plugins/core/hosts/PluginSidePanels.vue";

const tabs = useTabsStore();
const menus = useMenusStore();
const workspace = useWorkspaceStore();
const sidebar = useSidebarStore();
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
      const top = modalLayer.top();
      if (top) modalLayer.close(top.id);
      return;
    }
    if (!sidebar.isCollapsed) {
      sidebar.collapse();
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
  await bootstrapPlugins();
  await loadSessionIntoStores();
  await shortcutsStore.loadFromBackend();
  if (workspace.root) {
    await workspace.setRoot(workspace.root);
  }
  await openLaunchFileIfAny();
  installSessionAutoSave();
  installFileWatcher();
});
</script>

<template>
  <TopBar data-menu-root />
  <div
    class="workbench flex flex-1 min-h-0 overflow-hidden"
    @click="onAppClick"
  >
    <ActivityBar />
    <SidebarContainer />
    <div class="editor-pane flex-1 min-w-0 min-h-0 flex flex-col">
      <TabBar />
      <FileChangeBanner />
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
