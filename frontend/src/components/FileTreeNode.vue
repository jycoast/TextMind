<script setup lang="ts">
import { ref, watchEffect } from "vue";
import {
  ChevronRight,
  createElement,
  FileText,
  Folder,
  FolderOpen,
} from "lucide";
import type { FolderNode } from "@/types";

const props = defineProps<{
  node: FolderNode;
  depth: number;
  activePaths: Set<string>;
  indentPx?: number;
}>();

const emit = defineEmits<{
  (event: "open-file", path: string): void;
  (event: "toggle-dir", path: string): void;
}>();

const INDENT = props.indentPx ?? 14;
const chevronHost = ref<HTMLElement | null>(null);
const itemIconHost = ref<HTMLElement | null>(null);

watchEffect(() => {
  const chevron = chevronHost.value;
  const itemIcon = itemIconHost.value;
  const { isDir, expanded } = props.node;

  if (chevron) {
    chevron.replaceChildren();
    if (isDir) {
      chevron.appendChild(createElement(ChevronRight, {
        width: 14,
        height: 14,
        "aria-hidden": "true",
      }));
    }
  }

  if (itemIcon) {
    const definition = isDir ? (expanded ? FolderOpen : Folder) : FileText;
    itemIcon.replaceChildren(createElement(definition, {
      width: 15,
      height: 15,
      "aria-hidden": "true",
    }));
  }
});

function handleClick() {
  if (props.node.isDir) emit("toggle-dir", props.node.path);
  else emit("open-file", props.node.path);
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.node.isDir) return;
  if (event.key === "ArrowRight" && !props.node.expanded) {
    event.preventDefault();
    emit("toggle-dir", props.node.path);
  } else if (event.key === "ArrowLeft" && props.node.expanded) {
    event.preventDefault();
    emit("toggle-dir", props.node.path);
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
    :aria-expanded="node.isDir ? node.expanded : undefined"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <span
      ref="chevronHost"
      class="tree-chevron"
      :class="{ 'is-expanded': node.isDir && node.expanded }"
    ></span>
    <span ref="itemIconHost" class="tree-item-icon"></span>
    <span
      class="overflow-hidden text-ellipsis whitespace-nowrap"
      :class="{ 'font-medium': node.isDir }"
    >
      {{ node.name }}<span v-if="node.loading">（加载中...）</span>
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
        @open-file="(path) => emit('open-file', path)"
        @toggle-dir="(path) => emit('toggle-dir', path)"
      />
    </template>
  </template>
</template>

<style scoped>
.tree-row:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}

.tree-chevron,
.tree-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--muted);
}

.tree-chevron {
  width: 14px;
  height: 14px;
  transition: transform 120ms ease;
}

.tree-chevron.is-expanded {
  transform: rotate(90deg);
}

.tree-item-icon {
  width: 16px;
  height: 16px;
}
</style>
