<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import EditorHost from "./EditorHost.vue";
import SecondaryEditorHost from "./SecondaryEditorHost.vue";

const tabs = useTabsStore();
const { current, splitTab, splitRatio } = storeToRefs(tabs);
const workspace = ref<HTMLElement | null>(null);

function startResize(event: PointerEvent) {
  const root = workspace.value;
  if (!root) return;
  event.preventDefault();
  const onMove = (move: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    if (rect.width > 0) tabs.setSplitRatio((move.clientX - rect.left) / rect.width);
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
}
</script>

<template>
  <div ref="workspace" class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
    <div class="min-w-0 min-h-0 flex" :style="{ width: splitTab ? `${splitRatio * 100}%` : '100%' }">
      <EditorHost />
    </div>
    <template v-if="splitTab">
      <div
        class="group relative w-1.5 flex-none cursor-col-resize"
        role="separator"
        aria-label="调整分屏宽度"
        @pointerdown="startResize"
      >
        <span class="absolute inset-y-0 left-[2px] w-px bg-[var(--hairline)] group-hover:bg-[var(--accent)]"></span>
      </div>
      <section class="min-w-0 min-h-0 flex flex-col" :style="{ width: `${(1 - splitRatio) * 100}%` }">
        <header class="h-8 flex-none flex items-center gap-2 px-2 border-b border-[var(--hairline)] bg-[var(--panel)]">
          <span class="text-[12px] text-muted">对照</span>
          <select
            class="min-w-0 flex-1 h-6 px-1 text-[12px] rounded border border-[var(--hairline)] bg-[var(--bg)] text-[var(--text)]"
            :value="splitTab.id"
            title="选择右侧标签页"
            @change="tabs.setSplitTab(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="tab in tabs.tabs" :key="tab.id" :value="tab.id" :disabled="tab.id === current?.id">
              {{ tab.title }}{{ tab.dirty ? ' •' : '' }}
            </option>
          </select>
          <button class="w-6 h-6 border-0 bg-transparent text-muted hover:text-text cursor-pointer" title="关闭分屏" @click="tabs.closeSplit()">×</button>
        </header>
        <SecondaryEditorHost />
      </section>
    </template>
  </div>
</template>
