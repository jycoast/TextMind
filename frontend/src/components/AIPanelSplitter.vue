<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useAIPanelStore } from "@/stores/aiPanel";
import { useTabsStore } from "@/stores/tabs";

const panel = useAIPanelStore();
const tabs = useTabsStore();

let resizeState: { startX: number; startWidth: number } | null = null;

function beginResize(clientX: number) {
  if (!panel.visible) return;
  resizeState = { startX: clientX, startWidth: panel.width };
  panel.setResizing(true);
}

function updateResize(clientX: number) {
  if (!resizeState || !panel.visible) return;
  // Drag handle is on the LEFT edge of the right-side panel; dragging RIGHT
  // shrinks the panel.
  const delta = clientX - resizeState.startX;
  panel.setWidth(resizeState.startWidth - delta);
  tabs.adapter?.forceRefresh();
}

function endResize() {
  if (!resizeState) return;
  resizeState = null;
  panel.setResizing(false);
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
    class="ai-panel-splitter w-1.5 cursor-col-resize bg-transparent relative flex-none"
    aria-hidden="true"
    @mousedown="onMouseDown"
  >
    <span
      class="absolute top-0 bottom-0 right-[2px] w-px"
      :style="{ background: 'var(--hairline)' }"
    ></span>
  </div>
</template>

<style scoped>
.ai-panel-splitter:hover > span {
  background: var(--accent) !important;
}
</style>
