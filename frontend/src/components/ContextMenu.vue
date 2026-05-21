<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";
import DynamicMenu from "@/plugins/core/hosts/DynamicMenu.vue";

const menus = useMenusStore();
const { editorContextMenu } = storeToRefs(menus);
</script>

<template>
  <div
    v-if="editorContextMenu"
    class="tm-context-menu"
    :style="{
      left: `${editorContextMenu.x}px`,
      top: `${editorContextMenu.y}px`,
    }"
    @click.stop="menus.closeEditorContextMenu()"
  >
    <DynamicMenu menu-id="editor.context" variant="context" />
  </div>
</template>
