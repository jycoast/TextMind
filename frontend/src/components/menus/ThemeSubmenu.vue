<script setup lang="ts">
import type { Theme } from "@/types";

defineProps<{
  current: Theme;
}>();

const emit = defineEmits<{
  (e: "pick", theme: Theme): void;
}>();
</script>

<template>
  <div class="tm-submenu-panel" @click.stop>
    <button
      class="tm-menu-item"
      :class="{ 'text-text': current === 'dark' }"
      @click="emit('pick', 'dark')"
    >
      深色模式
    </button>
    <button
      class="tm-menu-item"
      :class="{ 'text-text': current === 'light' }"
      @click="emit('pick', 'light')"
    >
      浅色模式
    </button>
  </div>
</template>
