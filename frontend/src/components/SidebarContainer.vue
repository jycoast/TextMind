<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useSidebarStore } from "@/stores/sidebar";
import { useTabsStore } from "@/stores/tabs";

const sidebar = useSidebarStore();
const tabs = useTabsStore();

const splitterRef = ref<HTMLElement | null>(null);
let resizeState: { startX: number; startWidth: number } | null = null;

function beginResize(ev: MouseEvent) {
  ev.preventDefault();
  resizeState = { startX: ev.clientX, startWidth: sidebar.width };
  sidebar.setResizing(true);
}

function onMouseMove(ev: MouseEvent) {
  if (!resizeState) return;
  const delta = ev.clientX - resizeState.startX;
  sidebar.setWidth(resizeState.startWidth + delta);
  tabs.adapter?.forceRefresh();
}

function onMouseUp() {
  if (!resizeState) return;
  resizeState = null;
  sidebar.setResizing(false);
  tabs.adapter?.forceRefresh();
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
    v-if="!sidebar.isCollapsed && sidebar.currentPanel"
    class="sidebar-container"
    :style="{ width: sidebar.width + 'px' }"
  >
    <div class="sidebar-header">
      <span class="sidebar-title">{{ sidebar.currentPanel.title }}</span>
    </div>
    <div class="sidebar-content">
      <component :is="sidebar.currentPanel.component" />
    </div>
  </div>
  <div
    v-if="!sidebar.isCollapsed && sidebar.currentPanel"
    ref="splitterRef"
    class="sidebar-splitter"
    @mousedown="beginResize"
  >
    <span class="splitter-line"></span>
  </div>
</template>

<style scoped>
.sidebar-container {
  display: flex;
  flex-direction: column;
  min-width: 180px;
  max-width: 520px;
  background: var(--sidebar-bg);
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  padding: 10px 14px 6px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}

.sidebar-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-splitter {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  flex-shrink: 0;
}

.splitter-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: var(--hairline);
}

.sidebar-splitter:hover .splitter-line {
  background: var(--accent);
}
</style>
