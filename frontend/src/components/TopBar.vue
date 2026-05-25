<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted } from "vue";
import { menuRegistry, statusBarRegistry } from "@/plugins/core";
import DynamicMenu from "@/plugins/core/hosts/DynamicMenu.vue";

const topMenus = computed(() => menuRegistry.topMenuList().value);
const openMenu = ref<string | null>(null);
const rightItems = computed(() => statusBarRegistry.itemsAt("right").value);

function toggle(id: string) {
  openMenu.value = openMenu.value === id ? null : id;
}

function close() {
  openMenu.value = null;
}

function onDocClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement | null;
  if (!target?.closest("[data-menu-root]")) close();
}

onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

defineExpose({ close });
</script>

<template>
  <header class="block bg-bg" data-menu-root>
    <div
      class="h-8 flex items-center gap-0.5 px-2"
      :style="{ borderBottom: '1px solid var(--hairline)' }"
    >
      <div v-for="m in topMenus" :key="m.id" class="relative">
        <button
          class="h-7 px-2.5 text-[13px] border-0 bg-transparent cursor-pointer rounded-none"
          :class="{
            'text-text border border-solid': openMenu === m.id,
            'text-muted hover:text-text': openMenu !== m.id,
          }"
          :style="openMenu === m.id ? { borderColor: 'var(--accent)' } : {}"
          aria-haspopup="menu"
          :aria-expanded="openMenu === m.id"
          @click.stop="toggle(m.id)"
        >
          {{ m.label }}
        </button>
        <div
          v-if="openMenu === m.id"
          class="tm-menu-panel"
          role="menu"
          :aria-label="`${m.label}菜单`"
          @click.stop="close"
        >
          <DynamicMenu
            :menu-id="`topbar.${m.id}`"
            variant="topbar"
            @close="close"
          />
        </div>
      </div>
      <span class="ml-auto flex items-center pr-1 gap-1">
        <component :is="i.component" v-for="i in rightItems" :key="i.id" />
      </span>
    </div>
  </header>
</template>
