<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import TabItem from "./TabItem.vue";

const tabs = useTabsStore();
const menus = useMenusStore();
const { tabs: tabList, selectedIndex } = storeToRefs(tabs);

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
        @select="onSelect"
        @close="onClose"
        @context="onContext"
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
