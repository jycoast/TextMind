<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMenusStore } from "@/stores/menus";
import { useTabsStore } from "@/stores/tabs";

const emit = defineEmits<{
  (e: "template-sql"): void;
  (e: "toggle-column"): void;
  (e: "detect-language"): void;
}>();

const menus = useMenusStore();
const tabs = useTabsStore();
const { isEditMenuOpen } = storeToRefs(menus);
const { adapter, columnMode } = storeToRefs(tabs);

const columnSupported = computed(() =>
  Boolean(adapter.value?.supportsColumnMode),
);
const columnLabel = computed(() =>
  columnMode.value && columnSupported.value ? "列编辑  (已开启)" : "列编辑",
);

function triggerClick() {
  menus.toggleTopMenu("edit");
}

type Action = "template-sql" | "toggle-column" | "detect-language";
function click(action: Action) {
  switch (action) {
    case "template-sql":
      emit("template-sql");
      break;
    case "toggle-column":
      emit("toggle-column");
      break;
    case "detect-language":
      emit("detect-language");
      break;
  }
  menus.closeAllTopMenus();
}
</script>

<template>
  <div class="relative">
    <button
      class="h-7 px-2.5 text-[13px] border-0 bg-transparent cursor-pointer rounded-none"
      :class="{
        'text-text border border-solid': isEditMenuOpen,
        'text-muted hover:text-text': !isEditMenuOpen,
      }"
      :style="isEditMenuOpen ? { borderColor: 'var(--accent)' } : {}"
      aria-haspopup="menu"
      :aria-expanded="isEditMenuOpen"
      @click.stop="triggerClick"
    >
      编辑
    </button>
    <div
      v-if="isEditMenuOpen"
      class="tm-menu-panel"
      role="menu"
      aria-label="编辑菜单"
      @click.stop
    >
      <button
        class="tm-menu-item"
        :disabled="!columnSupported"
        :class="{ 'text-text': columnMode && columnSupported }"
        role="menuitem"
        @click="click('toggle-column')"
      >
        {{ columnLabel }}
      </button>
      <button
        class="tm-menu-item"
        role="menuitem"
        @click="click('template-sql')"
      >
        模板批量生成
      </button>
      <button
        class="tm-menu-item"
        role="menuitem"
        @click="click('detect-language')"
      >
        自动识别语言
      </button>
    </div>
  </div>
</template>
