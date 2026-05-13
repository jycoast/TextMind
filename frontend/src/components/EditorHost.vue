<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  createMonacoAdapter,
  defineMonacoThemes,
  getMonacoThemeName,
} from "@/composables/useMonaco";
import { useTabsStore } from "@/stores/tabs";
import { useThemeStore } from "@/stores/theme";
import { useMenusStore } from "@/stores/menus";
import CenterNotice from "./CenterNotice.vue";

const hostEl = ref<HTMLDivElement | null>(null);
const tabsStore = useTabsStore();
const themeStore = useThemeStore();
const menus = useMenusStore();
const { theme } = storeToRefs(themeStore);
const { columnMode } = storeToRefs(tabsStore);

onMounted(() => {
  if (!hostEl.value) return;
  defineMonacoThemes();
  const adapter = createMonacoAdapter({
    host: hostEl.value,
    initialTheme: theme.value,
  });

  adapter.onChange(() => {
    if (tabsStore.programmaticUpdate) return;
    const { changed } = tabsStore.pullLatestFromEditor();
    if (changed) tabsStore.markDirty();
  });

  adapter.onContextMenu((ev: MouseEvent) => {
    ev.preventDefault();
    menus.openEditorContextMenu({ x: ev.clientX, y: ev.clientY });
  });

  // 列编辑模式下，Monaco 会在每行末尾放一个光标。一旦用户通过点击、
  // Esc、方向键等方式让多光标塌缩回单光标，列编辑状态就应该自动结束，
  // 否则菜单栏会一直显示「已开启」，与编辑器实际状态不一致。
  // 仅在 “多光标 -> 单光标” 的过渡时触发，避免对仅 1 行的文件刚开启就被关闭。
  let lastSelectionsCount = 1;
  adapter.onSelectionsChange((count) => {
    const previous = lastSelectionsCount;
    lastSelectionsCount = count;
    if (previous > 1 && count <= 1 && tabsStore.columnMode) {
      tabsStore.columnMode = false;
    }
  });

  // setAdapter renders the current tab into the freshly-created editor
  // automatically, so we don't need a separate renderCurrentIntoEditor call
  // here.
  tabsStore.setAdapter(adapter);
});

onBeforeUnmount(() => {
  tabsStore.adapter?.dispose();
  tabsStore.setAdapter(null);
});

watch(theme, (next) => {
  tabsStore.adapter?.setTheme(getMonacoThemeName(next));
});

watch(columnMode, (enabled) => {
  if (!tabsStore.adapter) return;
  if (!tabsStore.adapter.supportsColumnMode) return;
  tabsStore.adapter.setColumnMode(enabled);
});
</script>

<template>
  <main
    class="relative flex-1 min-w-0 min-h-0 overflow-hidden"
  >
    <div ref="hostEl" id="editorHost" class="w-full h-full"></div>
    <CenterNotice />
  </main>
</template>
