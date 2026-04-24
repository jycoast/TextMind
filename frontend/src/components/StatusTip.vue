<script setup lang="ts">
import { useUiStore } from "@/stores/ui";
import { storeToRefs } from "pinia";

const { tip } = storeToRefs(useUiStore());
</script>

<template>
  <span
    v-if="tip"
    class="min-w-0 text-xs text-muted text-right whitespace-nowrap ml-2"
    aria-live="polite"
  >
    {{ tip }}
  </span>
</template>
