<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";

export type EditorContextAction =
  | "extract"
  | "dedupe"
  | "singleton"
  | "inlist"
  | "format-json"
  | "minify-json";

const emit = defineEmits<{
  (e: "action", action: EditorContextAction): void;
}>();

const menus = useMenusStore();
const { editorContextMenu } = storeToRefs(menus);

function handle(action: EditorContextAction) {
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
    <button @click="handle('extract')">提取...</button>
    <button @click="handle('dedupe')">去重</button>
    <button @click="handle('singleton')">保留单次出现项</button>
    <button @click="handle('inlist')">转IN列表</button>
    <button @click="handle('format-json')">格式化 JSON</button>
    <button @click="handle('minify-json')">压缩 JSON</button>
  </div>
</template>
