<script setup lang="ts">
import { commandRegistry } from "@/plugins/core";
import AIChatPanel from "@/components/AIChatPanel.vue";
import AIPanelSplitter from "@/components/AIPanelSplitter.vue";

function openSettings() {
  void commandRegistry.execute("ai.openSettings");
}
</script>

<template>
  <AIPanelSplitter />
  <AIChatPanel @open-settings="openSettings" />
</template>
