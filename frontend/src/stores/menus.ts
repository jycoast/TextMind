import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  ContextMenuPosition,
  SubMenuId,
  TabContextState,
  TopMenuId,
} from "@/types";

export const useMenusStore = defineStore("menus", () => {
  const topMenu = ref<TopMenuId>(null);
  const subMenu = ref<SubMenuId>(null);
  const editorContextMenu = ref<ContextMenuPosition | null>(null);
  const tabContextMenu = ref<TabContextState | null>(null);

  const isFileMenuOpen = computed(() => topMenu.value === "file");
  const isEditMenuOpen = computed(() => topMenu.value === "edit");
  const isSettingsMenuOpen = computed(() => topMenu.value === "settings");
  const isRecentSubmenuOpen = computed(
    () => topMenu.value === "file" && subMenu.value === "recent",
  );
  const isThemeSubmenuOpen = computed(
    () => topMenu.value === "settings" && subMenu.value === "theme",
  );

  function openTopMenu(id: Exclude<TopMenuId, null>): void {
    closeEditorContextMenu();
    closeTabContextMenu();
    topMenu.value = id;
    subMenu.value = null;
  }

  function toggleTopMenu(id: Exclude<TopMenuId, null>): void {
    if (topMenu.value === id) {
      closeAllTopMenus();
    } else {
      openTopMenu(id);
    }
  }

  function closeAllTopMenus(): void {
    topMenu.value = null;
    subMenu.value = null;
  }

  function openSubMenu(id: SubMenuId): void {
    subMenu.value = id;
  }

  function closeSubMenu(id: SubMenuId): void {
    if (subMenu.value === id) subMenu.value = null;
  }

  function openEditorContextMenu(position: ContextMenuPosition): void {
    closeAllTopMenus();
    closeTabContextMenu();
    editorContextMenu.value = position;
  }

  function closeEditorContextMenu(): void {
    editorContextMenu.value = null;
  }

  function openTabContextMenu(
    position: ContextMenuPosition,
    tabIndex: number,
  ): void {
    closeAllTopMenus();
    closeEditorContextMenu();
    tabContextMenu.value = { position, tabIndex };
  }

  function closeTabContextMenu(): void {
    tabContextMenu.value = null;
  }

  function closeEverything(): void {
    closeAllTopMenus();
    closeEditorContextMenu();
    closeTabContextMenu();
  }

  return {
    topMenu,
    subMenu,
    editorContextMenu,
    tabContextMenu,
    isFileMenuOpen,
    isEditMenuOpen,
    isSettingsMenuOpen,
    isRecentSubmenuOpen,
    isThemeSubmenuOpen,
    openTopMenu,
    toggleTopMenu,
    closeAllTopMenus,
    openSubMenu,
    closeSubMenu,
    openEditorContextMenu,
    closeEditorContextMenu,
    openTabContextMenu,
    closeTabContextMenu,
    closeEverything,
  };
});
