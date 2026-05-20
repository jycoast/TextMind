<script setup lang="ts">
import type { Tab } from "@/types";

const props = defineProps<{
  tab: Tab;
  active: boolean;
  index: number;
  dragging?: boolean;
  dropBefore?: boolean;
  dropAfter?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", index: number): void;
  (e: "close", index: number): void;
  (e: "context", index: number, position: { x: number; y: number }): void;
  (e: "drag-start", index: number, event: DragEvent): void;
  (e: "drag-over", index: number, before: boolean, event: DragEvent): void;
  (e: "drop", index: number, before: boolean, event: DragEvent): void;
  (e: "drag-end", index: number, event: DragEvent): void;
  (e: "drag-leave", index: number, event: DragEvent): void;
}>();

function onContext(e: MouseEvent, index: number) {
  e.preventDefault();
  e.stopPropagation();
  emit("context", index, { x: e.clientX, y: e.clientY });
}

function isBeforeHalf(e: DragEvent): boolean {
  const target = e.currentTarget as HTMLElement | null;
  if (!target) return true;
  const rect = target.getBoundingClientRect();
  return e.clientX < rect.left + rect.width / 2;
}

function onDragStart(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    // Required for Firefox; the payload itself is unused (we read state from the bar).
    e.dataTransfer.setData("text/plain", String(props.index));
  }
  emit("drag-start", props.index, e);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  emit("drag-over", props.index, isBeforeHalf(e), e);
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  emit("drop", props.index, isBeforeHalf(e), e);
}

function onDragEnd(e: DragEvent) {
  emit("drag-end", props.index, e);
}

function onDragLeave(e: DragEvent) {
  emit("drag-leave", props.index, e);
}
</script>

<template>
  <button
    class="tab relative inline-flex items-center justify-center h-8 px-3 text-[13px] cursor-pointer whitespace-nowrap box-border border border-solid rounded-t-[4px] transition-opacity"
    :class="{ active }"
    :style="{
      borderColor: 'var(--hairline)',
      borderBottom: active
        ? '2px solid var(--accent)'
        : '2px solid transparent',
      background: active ? 'var(--bg)' : 'var(--panel)',
      color: active ? 'var(--text)' : 'var(--muted)',
      opacity: dragging ? 0.4 : 1,
    }"
    draggable="true"
    @click="emit('select', index)"
    @contextmenu="(e) => onContext(e, index)"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
    @dragleave="onDragLeave"
  >
    <span
      v-if="dropBefore"
      class="absolute top-0 bottom-0 left-[-1px] w-[2px] pointer-events-none"
      :style="{ background: 'var(--accent)' }"
    ></span>
    <span
      v-if="dropAfter"
      class="absolute top-0 bottom-0 right-[-1px] w-[2px] pointer-events-none"
      :style="{ background: 'var(--accent)' }"
    ></span>
    <span>{{ tab.title }}</span>
    <span
      v-if="tab.dirty"
      class="inline-block w-[6px] h-[6px] ml-[7px] mr-[1px] rounded-full align-middle"
      style="background: #8ea3bd"
      title="未保存修改"
    ></span>
    <span
      class="ml-1.5 font-light"
      style="color: var(--muted)"
      @click.stop="emit('close', index)"
    >
      ×
    </span>
  </button>
</template>
