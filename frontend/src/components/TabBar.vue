<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import TabItem from "./TabItem.vue";

const tabs = useTabsStore();
const menus = useMenusStore();
const { tabs: tabList, selectedIndex } = storeToRefs(tabs);

const dragFrom = ref<number | null>(null);
const dragOver = ref<{ index: number; before: boolean } | null>(null);

function onSelect(i: number) {
  tabs.selectTab(i);
}

function onClose(i: number) {
  tabs.closeTab(i);
}

function onContext(i: number, pos: { x: number; y: number }) {
  menus.openTabContextMenu(pos, i);
}

function onNew() {
  tabs.addNewTab();
}

function onDragStart(i: number) {
  dragFrom.value = i;
  dragOver.value = null;
}

function onDragOver(i: number, before: boolean) {
  if (dragFrom.value === null) return;
  if (
    dragOver.value &&
    dragOver.value.index === i &&
    dragOver.value.before === before
  ) {
    return;
  }
  dragOver.value = { index: i, before };
}

function onDragLeave(i: number) {
  if (dragOver.value && dragOver.value.index === i) {
    dragOver.value = null;
  }
}

function onDrop(i: number, before: boolean) {
  const from = dragFrom.value;
  reset();
  if (from === null) return;
  // Convert "drop before/after tab i" into a gap index (0..len).
  const gap = before ? i : i + 1;
  // Final index after removing the source: shift down if the source was earlier.
  const dest = from < gap ? gap - 1 : gap;
  if (dest === from) return;
  tabs.moveTab(from, dest);
}

function onDragEnd() {
  reset();
}

function reset() {
  dragFrom.value = null;
  dragOver.value = null;
}
</script>

<template>
  <div
    class="tabbar min-h-[40px] flex items-start gap-0 p-0"
    :style="{ borderBottom: '1px solid var(--hairline)' }"
  >
    <div
      class="tabs flex items-start flex-wrap content-start gap-0 flex-1 min-h-[40px]"
    >
      <TabItem
        v-for="(tab, i) in tabList"
        :key="tab.id"
        :tab="tab"
        :index="i"
        :active="i === selectedIndex"
        :dragging="dragFrom === i"
        :drop-before="
          dragFrom !== null &&
          dragOver?.index === i &&
          dragOver?.before === true &&
          dragFrom !== i &&
          !(dragFrom === i - 1)
        "
        :drop-after="
          dragFrom !== null &&
          dragOver?.index === i &&
          dragOver?.before === false &&
          dragFrom !== i &&
          !(dragFrom === i + 1)
        "
        @select="onSelect"
        @close="onClose"
        @context="onContext"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drop="onDrop"
        @drag-end="onDragEnd"
        @drag-leave="onDragLeave"
      />
    </div>
    <button
      class="w-8 h-8 border-0 bg-transparent cursor-pointer text-[18px] leading-none text-muted hover:text-text"
      @click="onNew"
    >
      +
    </button>
  </div>
</template>
