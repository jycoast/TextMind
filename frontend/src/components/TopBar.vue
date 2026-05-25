<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { menuRegistry, statusBarRegistry } from "@/plugins/core";
import DynamicMenu from "@/plugins/core/hosts/DynamicMenu.vue";
import WindowControls from "@/components/WindowControls.vue";
import { useTabsStore } from "@/stores/tabs";
import {
  WindowSetTitle,
  WindowToggleMaximise,
} from "@wails/runtime/runtime";

const topMenus = computed(() => menuRegistry.topMenuList().value);
const openMenu = ref<string | null>(null);
const rightItems = computed(() => statusBarRegistry.itemsAt("right").value);

const tabs = useTabsStore();

const centerTitle = computed(() => {
  const t = tabs.current;
  if (!t) return "TextMind";
  const dirty = t.dirty ? "• " : "";
  const name = t.title || "未命名";
  return `${dirty}${name} — TextMind`;
});

watch(
  centerTitle,
  (v) => {
    try {
      WindowSetTitle(v);
    } catch {
      // Wails runtime unavailable in plain vite dev — ignore.
    }
  },
  { immediate: true },
);

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

function onTitlebarDblClick(ev: MouseEvent) {
  const el = ev.target as HTMLElement | null;
  // Only treat clicks on the drag surface itself (or its non-interactive
  // children) as a maximise toggle. Buttons, menus and other interactive
  // elements opt out via .wails-no-drag.
  if (el?.closest(".wails-no-drag")) return;
  try {
    WindowToggleMaximise();
  } catch {
    // dev fallback
  }
}

onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

defineExpose({ close });
</script>

<template>
  <header class="block bg-bg wails-drag" data-menu-root>
    <div
      class="h-9 flex items-stretch gap-0.5 pl-2"
      :style="{ borderBottom: '1px solid var(--hairline)' }"
      @dblclick="onTitlebarDblClick"
    >
      <span
        class="flex items-center gap-1.5 pr-2 select-none pointer-events-none"
      >
        <img
          src="@/assets/TextMind-logo.png"
          class="w-4 h-4"
          alt=""
          draggable="false"
        />
      </span>

      <div
        v-for="m in topMenus"
        :key="m.id"
        class="relative wails-no-drag flex items-center"
      >
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
          class="tm-menu-panel wails-no-drag"
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

      <div
        class="flex-1 h-full flex items-center justify-center overflow-hidden px-2 wails-drag"
      >
        <span class="text-[12px] text-muted truncate max-w-full select-none">
          {{ centerTitle }}
        </span>
      </div>

      <span
        class="flex items-center gap-1 pr-1 wails-no-drag"
      >
        <component :is="i.component" v-for="i in rightItems" :key="i.id" />
      </span>

      <WindowControls />
    </div>
  </header>
</template>
