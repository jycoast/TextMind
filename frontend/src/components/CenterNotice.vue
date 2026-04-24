<script setup lang="ts">
import { useUiStore } from "@/stores/ui";
import { storeToRefs } from "pinia";

const { centerNotice } = storeToRefs(useUiStore());
</script>

<template>
  <div
    v-if="centerNotice"
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none text-center text-[13px] px-3.5 py-2.5 rounded-md border"
    :style="{
      background: 'var(--panel-elevated)',
      color: 'var(--text)',
      borderColor: 'var(--hairline)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
      maxWidth: 'min(560px, calc(100% - 40px))',
    }"
    aria-live="polite"
  >
    {{ centerNotice }}
  </div>
</template>
