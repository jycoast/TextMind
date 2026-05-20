<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";

export type EditorContextAction =
  | "extract"
  | "dedupe"
  | "singleton"
  | "duplicates"
  | "inlist"
  | "format-json"
  | "minify-json"
  | "ai-insert-input";

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
    <button @click="handle('extract')">提取文本</button>
    <button @click="handle('dedupe')">去重</button>
    <button @click="handle('singleton')">保留单次出现项</button>
    <button @click="handle('duplicates')">保留重复项</button>
    <button @click="handle('inlist')">转IN列表</button>
    <div class="tm-context-menu__separator" role="separator" />
    <button @click="handle('format-json')">格式化 JSON</button>
    <button @click="handle('minify-json')">压缩 JSON</button>
    <div class="tm-context-menu__separator" role="separator" />
    <button @click="handle('ai-insert-input')">插入到 AI 对话框</button>
  </div>
</template>
