<script setup lang="ts">
import { computed } from "vue";
import { sidePanelRegistry } from "@/plugins/core";

const props = defineProps<{ position: "left" | "right" }>();

const panels = computed(() =>
  sidePanelRegistry
    .list()
    .filter((p) => p.position === props.position && p.visible),
);
</script>

<template>
  <template v-for="p in panels" :key="p.id">
    <component :is="p.component" />
  </template>
</template>
