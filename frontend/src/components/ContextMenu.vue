<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";

const emit = defineEmits<{
  (e: "action", action: "dedupe" | "singleton" | "inlist"): void;
}>();

const menus = useMenusStore();
const { editorContextMenu } = storeToRefs(menus);

function handle(action: "dedupe" | "singleton" | "inlist") {
  menus.closeEditorContextMenu();
  emit("action", action);
}
</script>

<template>
  <div
    v-if="editorContextMenu"
    class="tm-context-menu"
    :style="{
      left: `${editorContextMenu.x}px`,
      top: `${editorContextMenu.y}px`,
    }"
    @click.stop
  >
    <button @click="handle('dedupe')">去重</button>
    <button @click="handle('singleton')">保留单次出现项</button>
    <button @click="handle('inlist')">转IN列表</button>
  </div>
</template>
