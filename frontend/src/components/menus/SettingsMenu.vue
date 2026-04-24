<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";
import { useThemeStore } from "@/stores/theme";
import ThemeSubmenu from "./ThemeSubmenu.vue";

const menus = useMenusStore();
const themeStore = useThemeStore();
const { isSettingsMenuOpen, isThemeSubmenuOpen } = storeToRefs(menus);
const { theme } = storeToRefs(themeStore);

function triggerClick() {
  menus.toggleTopMenu("settings");
}

function onHoverTheme() {
  menus.openSubMenu("theme");
}

function onPanelMouseLeave() {
  menus.closeSubMenu("theme");
}

function pickTheme(next: "dark" | "light") {
  themeStore.setTheme(next);
  menus.closeAllTopMenus();
}
</script>

<template>
  <div class="relative">
    <button
      class="h-7 px-2.5 text-[13px] border-0 bg-transparent cursor-pointer rounded-none"
      :class="{
        'text-text border border-solid': isSettingsMenuOpen,
        'text-muted hover:text-text': !isSettingsMenuOpen,
      }"
      :style="isSettingsMenuOpen ? { borderColor: 'var(--accent)' } : {}"
      aria-haspopup="menu"
      :aria-expanded="isSettingsMenuOpen"
      @click.stop="triggerClick"
    >
      设置
    </button>
    <div
      v-if="isSettingsMenuOpen"
      class="tm-menu-panel"
      role="menu"
      aria-label="设置菜单"
      @click.stop
      @mouseleave="onPanelMouseLeave"
    >
      <div class="relative">
        <button
          class="tm-menu-item flex items-center justify-between gap-2"
          role="menuitem"
          @click.stop="onHoverTheme"
          @mouseenter="onHoverTheme"
        >
          <span>主题设置</span>
          <span class="text-muted text-[13px]">›</span>
        </button>
        <ThemeSubmenu
          v-if="isThemeSubmenuOpen"
          :current="theme"
          @pick="pickTheme"
        />
      </div>
    </div>
  </div>
</template>
