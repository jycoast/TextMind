<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useExplorerStore } from "@/stores/explorer";
import { useTabsStore } from "@/stores/tabs";

const explorer = useExplorerStore();
const tabs = useTabsStore();
const { collapsed } = storeToRefs(explorer);

let resizeState: { startX: number; startWidth: number } | null = null;

function beginResize(clientX: number) {
  if (explorer.collapsed) return;
  resizeState = { startX: clientX, startWidth: explorer.width };
  explorer.setResizing(true);
}

function updateResize(clientX: number) {
  if (!resizeState || explorer.collapsed) return;
  const delta = clientX - resizeState.startX;
  explorer.setWidth(resizeState.startWidth + delta);
  tabs.adapter?.forceRefresh();
}

function endResize() {
  if (!resizeState) return;
  resizeState = null;
  explorer.setResizing(false);
  tabs.adapter?.forceRefresh();
}

function onMouseDown(ev: MouseEvent) {
  ev.preventDefault();
  beginResize(ev.clientX);
}

function onMouseMove(ev: MouseEvent) {
  updateResize(ev.clientX);
}

function onMouseUp() {
  endResize();
}

onMounted(() => {
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <div
    v-show="!collapsed"
    class="explorer-splitter w-1.5 cursor-col-resize bg-transparent relative flex-none"
    aria-hidden="true"
    @mousedown="onMouseDown"
  >
    <span
      class="absolute top-0 bottom-0 left-[2px] w-px"
      :style="{ background: 'var(--hairline)' }"
    ></span>
  </div>
</template>

<style scoped>
.explorer-splitter:hover > span {
  background: var(--accent) !important;
}
</style>
