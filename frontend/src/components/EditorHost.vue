<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { getMonacoThemeName } from "@/composables/useMonaco";
import { useTabsStore } from "@/stores/tabs";
import { useThemeStore } from "@/stores/theme";
import { useMenusStore } from "@/stores/menus";
import { editorRegistry } from "@/plugins/core";
import type { EditorAdapter } from "@/types";
import CenterNotice from "./CenterNotice.vue";

const hostEl = ref<HTMLDivElement | null>(null);
const tabsStore = useTabsStore();
const themeStore = useThemeStore();
const menus = useMenusStore();
const { theme } = storeToRefs(themeStore);
const { columnMode, current } = storeToRefs(tabsStore);

let currentAdapter: EditorAdapter | null = null;
let currentEditorRecId: string | null = null;

function attachAdapter(adapter: EditorAdapter) {
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
  // Esc、方向键等方式让多光标塌缩回单光标，列编辑状态就应该自动结束。
  let lastSelectionsCount = 1;
  adapter.onSelectionsChange((count) => {
    const previous = lastSelectionsCount;
    lastSelectionsCount = count;
    if (previous > 1 && count <= 1 && tabsStore.columnMode) {
      tabsStore.columnMode = false;
    }
  });

  tabsStore.setAdapter(adapter);
  editorRegistry.emitAttached(adapter);
}

function rebuildAdapter(reason: string) {
  if (!hostEl.value) return;
  const tab = current.value;
  if (!tab) {
    if (currentAdapter) {
      currentAdapter.dispose();
      currentAdapter = null;
      tabsStore.setAdapter(null);
      currentEditorRecId = null;
    }
    return;
  }
  const rec = editorRegistry.pickFor(tab);
  if (!rec) {
    console.warn(`[editor] no editor matched for tab (${reason})`);
    return;
  }
  if (currentAdapter && currentEditorRecId === rec.id) {
    // Same editor; tab change is handled by setAdapter -> renderCurrentIntoEditor.
    return;
  }
  if (currentAdapter) {
    // Flush the outgoing adapter's content + view state into the tab so the
    // incoming adapter can hydrate from the canonical source. Without this,
    // unsaved edits made in (e.g.) Milkdown would be lost the moment the
    // user toggled to Monaco source mode.
    try {
      tabsStore.persistCurrentText();
      tabsStore.persistCurrentViewState();
    } catch (err) {
      console.warn("[editor] persist before swap failed:", err);
    }
    currentAdapter.dispose();
    currentAdapter = null;
  }
  const next = rec.factory(hostEl.value, {
    initialTheme: theme.value,
    tab,
  });
  currentAdapter = next;
  currentEditorRecId = rec.id;
  attachAdapter(next);
}

onMounted(() => {
  rebuildAdapter("mount");
});

watch(
  () => current.value?.id,
  () => rebuildAdapter("tabChanged"),
);

// React when the user explicitly changes the editor for a tab (e.g. via
// "toggle source view"). We only rebuild when the *selected* editor differs
// from the currently mounted one.
watch(
  () => current.value?.editorId,
  () => rebuildAdapter("editorIdChanged"),
);

// Refresh whenever a plugin registers a new editor at runtime - rare but
// supports hot plugin activation.
const unsubRegistry = editorRegistry.onEditorAttached(() => {
  /* no-op: we trigger rebuild from tab/editorId watchers */
});

onBeforeUnmount(() => {
  unsubRegistry.dispose();
  currentAdapter?.dispose();
  currentAdapter = null;
  tabsStore.setAdapter(null);
});

watch(theme, (next) => {
  currentAdapter?.setTheme(getMonacoThemeName(next));
});

watch(columnMode, (enabled) => {
  if (!currentAdapter) return;
  if (!currentAdapter.supportsColumnMode) return;
  currentAdapter.setColumnMode(enabled);
});
</script>

<template>
  <main class="relative flex-1 min-w-0 min-h-0 overflow-hidden">
    <div ref="hostEl" id="editorHost" class="w-full h-full"></div>
    <CenterNotice />
  </main>
</template>
