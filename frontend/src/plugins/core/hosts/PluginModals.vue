<script setup lang="ts">
import { computed } from "vue";
import { modalLayer } from "@/plugins/core";

const modals = computed(() => Array.from(modalLayer.modals.values()));
</script>

<template>
  <component
    :is="m.component"
    v-for="m in modals"
    :key="m.id"
    v-bind="m.props"
    @close="modalLayer.close(m.id)"
  />
</template>
