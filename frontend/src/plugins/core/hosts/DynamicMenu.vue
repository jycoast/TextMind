<script setup lang="ts">
import { computed, ref } from "vue";
import {
  commandRegistry,
  menuRegistry,
  type MenuItemRecord,
} from "@/plugins/core";
import type { SubmenuItem } from "@/plugins/core";

const props = defineProps<{
  menuId: string;
  variant?: "topbar" | "context";
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const items = computed(() => menuRegistry.itemsFor(props.menuId).value);

const openSubmenuId = ref<string | null>(null);

function labelOf(item: MenuItemRecord): string {
  return typeof item.label === "function" ? item.label() : item.label;
}

function isVisible(item: MenuItemRecord): boolean {
  return item.visible ? Boolean(item.visible()) : true;
}

function isEnabled(item: MenuItemRecord): boolean {
  return item.enabled ? Boolean(item.enabled()) : true;
}

function hasSubmenu(item: MenuItemRecord): boolean {
  return typeof item.submenuProvider === "function";
}

// Pulled lazily so the list refreshes every time the user reopens the
// flyout (recent files, open editors, etc. are dynamic).
function submenuItemsOf(item: MenuItemRecord): SubmenuItem[] {
  if (!item.submenuProvider) return [];
  try {
    return item.submenuProvider() || [];
  } catch (err) {
    console.error("[menu] submenuProvider failed:", err);
    return [];
  }
}

function openSubmenu(item: MenuItemRecord) {
  if (!hasSubmenu(item) || !isEnabled(item)) return;
  openSubmenuId.value = item.id;
}

function closeSubmenuIfFor(item: MenuItemRecord) {
  if (openSubmenuId.value === item.id) openSubmenuId.value = null;
}

async function clickParent(item: MenuItemRecord) {
  if (!isEnabled(item)) return;
  if (hasSubmenu(item)) {
    // Hover-only parent — click toggles the flyout instead of running a
    // command (we ignore commandId for submenu parents, see types.ts).
    openSubmenuId.value = openSubmenuId.value === item.id ? null : item.id;
    return;
  }
  if (item.commandId) {
    await commandRegistry.execute(item.commandId);
  }
  emit("close");
}

async function clickChild(child: SubmenuItem) {
  if (child.disabled || !child.commandId) return;
  await commandRegistry.execute(child.commandId, ...(child.commandArgs || []));
  openSubmenuId.value = null;
  emit("close");
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
    <div
      v-if="isVisible(item) && hasSubmenu(item)"
      class="relative"
      @mouseenter="openSubmenu(item)"
      @mouseleave="closeSubmenuIfFor(item)"
    >
      <button
        class="tm-menu-item flex items-center justify-between gap-2"
        :class="{ 'tm-menu-item--disabled': !isEnabled(item) }"
        :disabled="!isEnabled(item)"
        role="menuitem"
        aria-haspopup="menu"
        :aria-expanded="openSubmenuId === item.id"
        @click.stop="clickParent(item)"
      >
        <span>{{ labelOf(item) }}</span>
        <span class="text-muted text-[13px]">›</span>
      </button>
      <div
        v-if="openSubmenuId === item.id"
        class="tm-submenu-panel"
        role="menu"
        @click.stop
      >
        <button
          v-if="submenuItemsOf(item).length === 0"
          class="tm-menu-item text-center"
          disabled
        >
          暂无记录
        </button>
        <button
          v-for="child in submenuItemsOf(item)"
          v-else
          :key="child.id"
          class="tm-menu-item overflow-hidden text-ellipsis whitespace-nowrap max-w-[360px]"
          :class="{ 'tm-menu-item--disabled': child.disabled }"
          :disabled="child.disabled"
          :title="child.title || child.label"
          role="menuitem"
          @click.stop="clickChild(child)"
        >
          {{ child.label }}
        </button>
      </div>
    </div>
    <button
      v-else-if="isVisible(item)"
      class="tm-menu-item"
      :class="{ 'tm-menu-item--disabled': !isEnabled(item) }"
      :disabled="!isEnabled(item)"
      role="menuitem"
      @click.stop="clickParent(item)"
    >
      {{ labelOf(item) }}
    </button>
  </template>
</template>
