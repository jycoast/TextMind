<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useExplorerStore } from "@/stores/explorer";
import { useTabsStore } from "@/stores/tabs";

const explorer = useExplorerStore();
const tabs = useTabsStore();
const { collapsed } = storeToRefs(explorer);

const label = computed(() =>
  collapsed.value ? "展开文件夹" : "收起文件夹",
);
const arrow = computed(() => (collapsed.value ? "▶" : "◀"));

function onToggle() {
  explorer.toggleCollapsed();
  setTimeout(() => tabs.adapter?.forceRefresh(), 0);
}
</script>

<template>
  <footer
    class="h-6 flex items-center px-1.5 box-border"
    :style="{
      background: 'var(--panel)',
      borderTop: '1px solid var(--hairline)',
    }"
  >
    <button
      type="button"
      class="w-[22px] h-5 p-0 rounded-sm text-xs leading-none cursor-pointer bg-transparent border border-solid border-transparent"
      :style="{ color: 'var(--muted)' }"
      :aria-label="label"
      :title="label"
      :aria-expanded="collapsed ? 'false' : 'true'"
      @click="onToggle"
    >
      {{ arrow }}
    </button>
  </footer>
</template>

<style scoped>
button:hover {
  color: var(--text) !important;
  border-color: var(--hairline) !important;
}
</style>
