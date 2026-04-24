<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";
import { useTabsStore } from "@/stores/tabs";

const menus = useMenusStore();
const tabs = useTabsStore();
const { tabContextMenu } = storeToRefs(menus);

function handle(action: "close" | "close-right" | "close-left" | "close-others") {
  const ctx = menus.tabContextMenu;
  menus.closeTabContextMenu();
  if (!ctx) return;
  const i = ctx.tabIndex;
  if (i < 0) return;
  if (action === "close") tabs.closeTab(i);
  else if (action === "close-right") tabs.closeRight(i);
  else if (action === "close-left") tabs.closeLeft(i);
  else if (action === "close-others") tabs.closeOthers(i);
}
</script>

<template>
  <div
    v-if="tabContextMenu"
    class="tm-context-menu min-w-[170px]"
    :style="{
      left: `${tabContextMenu.position.x}px`,
      top: `${tabContextMenu.position.y}px`,
    }"
    @click.stop
  >
    <button @click="handle('close')">关闭tab</button>
    <button @click="handle('close-right')">关闭右侧tab</button>
    <button @click="handle('close-left')">关闭左侧tab</button>
    <button @click="handle('close-others')">关闭其他tab</button>
  </div>
</template>
