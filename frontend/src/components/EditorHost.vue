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
