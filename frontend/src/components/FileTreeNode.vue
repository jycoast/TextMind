<script setup lang="ts">
import type { FolderNode } from "@/types";

const props = defineProps<{
  node: FolderNode;
  depth: number;
  activePaths: Set<string>;
  indentPx?: number;
}>();

const emit = defineEmits<{
  (e: "open-file", path: string): void;
  (e: "toggle-dir", path: string): void;
}>();

const INDENT = props.indentPx ?? 14;

function handleClick() {
  if (props.node.isDir) {
    emit("toggle-dir", props.node.path);
  } else {
    emit("open-file", props.node.path);
  }
}
</script>

<template>
  <button
    type="button"
    class="tree-row flex items-center gap-1.5 w-full border-0 bg-transparent text-left text-xs leading-normal py-[3px] cursor-pointer tm-hover-surface"
    :class="{ 'bg-[var(--active-row-bg)]': !node.isDir && activePaths.has(node.path) }"
    :style="{ paddingLeft: `${10 + depth * INDENT}px`, color: 'var(--text)' }"
    :title="node.path"
    @click="handleClick"
  >
    <span class="flex-none w-2.5 text-center" style="color: var(--muted)">
      {{ node.isDir ? (node.expanded ? "▾" : "▸") : "" }}
    </span>
    <span class="flex-none w-4 text-center leading-none">
      {{ node.isDir ? (node.expanded ? "📂" : "📁") : "📄" }}
    </span>
    <span
      class="overflow-hidden text-ellipsis whitespace-nowrap"
      :class="{ 'font-medium': node.isDir }"
    >
      {{ node.name }}<span v-if="node.loading"> (加载中...)</span>
    </span>
  </button>

  <template v-if="node.isDir && node.expanded">
    <div
      v-if="node.error"
      class="py-2 px-2.5 text-xs"
      :style="{
        color: 'var(--muted)',
        paddingLeft: `${24 + depth * INDENT}px`,
      }"
    >
      {{ node.error }}
    </div>
    <div
      v-else-if="!node.loading && node.loaded && node.children.length === 0"
      class="py-2 px-2.5 text-xs"
      :style="{
        color: 'var(--muted)',
        paddingLeft: `${24 + depth * INDENT}px`,
      }"
    >
      空文件夹
    </div>
    <template v-else>
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :active-paths="activePaths"
        :indent-px="INDENT"
        @open-file="(p) => emit('open-file', p)"
        @toggle-dir="(p) => emit('toggle-dir', p)"
      />
    </template>
  </template>
</template>
