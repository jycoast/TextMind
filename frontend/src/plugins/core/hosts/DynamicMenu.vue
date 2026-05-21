<script setup lang="ts">
import { computed } from "vue";
import { commandRegistry, menuRegistry, type MenuItemRecord } from "@/plugins/core";

const props = defineProps<{
  menuId: string;
  variant?: "topbar" | "context";
}>();

const items = computed(() => menuRegistry.itemsFor(props.menuId).value);

function labelOf(item: MenuItemRecord): string {
  return typeof item.label === "function" ? item.label() : item.label;
}

function isVisible(item: MenuItemRecord): boolean {
  return item.visible ? Boolean(item.visible()) : true;
}

function isEnabled(item: MenuItemRecord): boolean {
  return item.enabled ? Boolean(item.enabled()) : true;
}

async function click(item: MenuItemRecord) {
  if (!isEnabled(item) || !item.commandId) return;
  await commandRegistry.execute(item.commandId);
}
</script>

<template>
  <template v-for="(item, i) in items" :key="item.id">
    <div
      v-if="
        item.separatorBefore &&
        i > 0 &&
        items[i - 1] &&
        items[i - 1].group !== item.group
      "
      class="tm-menu-sep"
      role="separator"
    />
    <button
      v-if="isVisible(item)"
      class="tm-menu-item"
      :class="{ 'tm-menu-item--disabled': !isEnabled(item) }"
      :disabled="!isEnabled(item)"
      role="menuitem"
      @click.stop="click(item)"
    >
      {{ labelOf(item) }}
    </button>
  </template>
</template>
