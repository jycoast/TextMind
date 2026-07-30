<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { getMonacoThemeName } from "@/composables/useMonaco";
import { editorRegistry } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useThemeStore } from "@/stores/theme";
import type { EditorAdapter, Tab, ViewStateBag } from "@/types";

const host = ref<HTMLDivElement | null>(null);
const tabs = useTabsStore();
const themeStore = useThemeStore();
const { splitTab } = storeToRefs(tabs);
const { theme } = storeToRefs(themeStore);
let adapter: EditorAdapter | null = null;
let attachedTab: Tab | null = null;

function persist() {
  if (!adapter || !attachedTab) return;
  attachedTab.text = adapter.getValue();
  const state = adapter.getViewState?.();
  if (state != null) {
    const bag: ViewStateBag = { ...(attachedTab.viewState || {}) };
    bag[adapter.id] = state;
    attachedTab.viewState = bag;
  }
}

function dispose() {
  persist();
  adapter?.dispose();
  adapter = null;
  attachedTab = null;
  if (host.value) host.value.replaceChildren();
}

function rebuild() {
  dispose();
  const tab = splitTab.value;
  if (!host.value || !tab) return;
  const rec = editorRegistry.pickFor(tab);
  if (!rec) return;
  attachedTab = tab;
  adapter = rec.factory(host.value, { initialTheme: theme.value, tab });
  adapter.setValue(tab.text || "");
  adapter.setLanguage(tab.language);
  adapter.setViewState(tab.viewState?.[adapter.id] ?? null);
  adapter.onChange(() => {
    if (!adapter || !attachedTab) return;
    const value = adapter.getValue();
    if (value === attachedTab.text) return;
    attachedTab.text = value;
    attachedTab.dirty = true;
  });
  adapter.focus();
}

onMounted(rebuild);
watch(() => splitTab.value?.id, rebuild);
watch(() => splitTab.value?.editorId, rebuild);
watch(theme, (value) => adapter?.setTheme(getMonacoThemeName(value)));
onBeforeUnmount(dispose);
</script>

<template>
  <main class="relative flex-1 min-w-0 min-h-0 overflow-hidden">
    <div ref="host" class="w-full h-full"></div>
  </main>
</template>
