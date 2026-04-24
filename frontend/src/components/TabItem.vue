<script setup lang="ts">
import type { Tab } from "@/types";

defineProps<{
  tab: Tab;
  active: boolean;
  index: number;
}>();

const emit = defineEmits<{
  (e: "select", index: number): void;
  (e: "close", index: number): void;
  (e: "context", index: number, position: { x: number; y: number }): void;
}>();

function onContext(e: MouseEvent, index: number) {
  e.preventDefault();
  e.stopPropagation();
  emit("context", index, { x: e.clientX, y: e.clientY });
}
</script>

<template>
  <button
    class="tab inline-flex items-center justify-center h-8 px-3 text-[13px] cursor-pointer whitespace-nowrap box-border border border-solid rounded-t-[4px]"
    :class="{ active }"
    :style="{
      borderColor: 'var(--hairline)',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      background: active ? 'var(--bg)' : 'var(--panel)',
      color: active ? 'var(--text)' : 'var(--muted)',
    }"
    @click="emit('select', index)"
    @contextmenu="(e) => onContext(e, index)"
  >
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
