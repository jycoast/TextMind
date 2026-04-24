<script setup lang="ts">
import { useMenusStore } from "@/stores/menus";
import { useRecentStore } from "@/stores/recent";
import { storeToRefs } from "pinia";
import RecentFilesSubmenu from "./RecentFilesSubmenu.vue";

const emit = defineEmits<{
  (e: "save"): void;
  (e: "openFile"): void;
  (e: "openFolder"): void;
  (e: "openRecent", path: string): void;
}>();

const menus = useMenusStore();
const { isFileMenuOpen, isRecentSubmenuOpen } = storeToRefs(menus);
const { files: recentFiles } = storeToRefs(useRecentStore());

function triggerClick() {
  menus.toggleTopMenu("file");
}

function onPanelMouseLeave() {
  menus.closeSubMenu("recent");
}

function onHoverRecent() {
  menus.openSubMenu("recent");
}

function click(action: "save" | "open" | "openFolder") {
  if (action === "save") emit("save");
  else if (action === "open") emit("openFile");
  else if (action === "openFolder") emit("openFolder");
  menus.closeAllTopMenus();
}
</script>

<template>
  <div class="relative">
    <button
      class="h-7 px-2.5 text-[13px] border-0 bg-transparent cursor-pointer rounded-none"
      :class="{
        'text-text border border-solid': isFileMenuOpen,
        'text-muted hover:text-text': !isFileMenuOpen,
      }"
      :style="isFileMenuOpen ? { borderColor: 'var(--accent)' } : {}"
      aria-haspopup="menu"
      :aria-expanded="isFileMenuOpen"
      @click.stop="triggerClick"
    >
      文件
    </button>
    <div
      v-if="isFileMenuOpen"
      class="tm-menu-panel"
      role="menu"
      aria-label="文件菜单"
      @click.stop
      @mouseleave="onPanelMouseLeave"
    >
      <button class="tm-menu-item" role="menuitem" @click="click('save')">
        保存
      </button>
      <button class="tm-menu-item" role="menuitem" @click="click('open')">
        打开文件...
      </button>
      <button class="tm-menu-item" role="menuitem" @click="click('openFolder')">
        打开文件夹...
      </button>
      <div class="tm-menu-sep"></div>
      <div class="relative">
        <button
          class="tm-menu-item flex items-center justify-between gap-2"
          role="menuitem"
          @click.stop="onHoverRecent"
          @mouseenter="onHoverRecent"
        >
          <span>最近打开文件</span>
          <span class="text-muted text-[13px]">›</span>
        </button>
        <RecentFilesSubmenu
          v-if="isRecentSubmenuOpen"
          :files="recentFiles"
          @pick="
            (path) => {
              emit('openRecent', path);
              menus.closeAllTopMenus();
            }
          "
        />
      </div>
    </div>
  </div>
</template>
