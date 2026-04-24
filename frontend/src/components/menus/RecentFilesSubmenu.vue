<script setup lang="ts">
import type { RecentFile } from "@/types";

defineProps<{
  files: RecentFile[];
}>();

const emit = defineEmits<{
  (e: "pick", path: string): void;
}>();
</script>

<template>
  <div class="tm-submenu-panel" @click.stop>
    <button
      v-if="files.length === 0"
      class="tm-menu-item text-center"
      disabled
    >
      暂无记录
    </button>
    <button
      v-for="item in files"
      v-else
      :key="item.path"
      class="tm-menu-item overflow-hidden text-ellipsis whitespace-nowrap max-w-[320px]"
      :title="item.path"
      @click="emit('pick', item.path)"
    >
      {{ item.name || item.path }}
    </button>
  </div>
</template>
