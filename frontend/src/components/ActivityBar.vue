<script setup lang="ts">
import { useSidebarStore } from "@/stores/sidebar";

const sidebar = useSidebarStore();

const icons: Record<string, string> = {
  files: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
  outline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>`,
  git: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M12 15V9M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/></svg>`,
};

function getIcon(id: string): string {
  return icons[id] || icons["files"];
}
</script>

<template>
  <div class="activity-bar">
    <button
      v-for="panel in sidebar.sortedPanels"
      :key="panel.id"
      class="activity-btn"
      :class="{ active: sidebar.activePanel === panel.id }"
      :title="panel.title"
      @click="sidebar.toggle(panel.id)"
    >
      <span class="activity-icon" v-html="getIcon(panel.id)"></span>
    </button>
  </div>
</template>

<style scoped>
.activity-bar {
  width: 48px;
  min-width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  gap: 2px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--hairline);
  flex-shrink: 0;
}

.activity-btn {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--muted);
  transition: color 0.15s, background 0.15s;
}

.activity-btn:hover {
  color: var(--text);
  background: var(--hover-bg);
}

.activity-btn.active {
  color: var(--accent);
  background: var(--active-row-bg);
}

.activity-btn.active::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
}

.activity-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.activity-icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
