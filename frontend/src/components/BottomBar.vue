<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useExplorerStore } from "@/stores/explorer";
import { useTabsStore } from "@/stores/tabs";
import {
  LANGUAGE_OPTIONS,
  getLanguageLabel,
} from "@/composables/useLanguageOptions";

const explorer = useExplorerStore();
const tabs = useTabsStore();
const { collapsed } = storeToRefs(explorer);
const { current } = storeToRefs(tabs);

const label = computed(() =>
  collapsed.value ? "展开文件夹" : "收起文件夹",
);
const arrow = computed(() => (collapsed.value ? "▶" : "◀"));

const currentLang = computed(() => current.value?.language || "plaintext");
const currentLabel = computed(() => getLanguageLabel(currentLang.value));

const pickerOpen = ref(false);
const filter = ref("");
const pickerRoot = ref<HTMLElement | null>(null);
const filterInput = ref<HTMLInputElement | null>(null);

const filteredOptions = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return LANGUAGE_OPTIONS;
  return LANGUAGE_OPTIONS.filter(
    (o) =>
      o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
  );
});

function onToggle() {
  explorer.toggleCollapsed();
  setTimeout(() => tabs.adapter?.forceRefresh(), 0);
}

function openPicker() {
  pickerOpen.value = true;
  filter.value = "";
  setTimeout(() => filterInput.value?.focus(), 0);
}

function closePicker() {
  pickerOpen.value = false;
  filter.value = "";
}

function togglePicker() {
  if (pickerOpen.value) closePicker();
  else openPicker();
}

function pickLanguage(id: string) {
  tabs.setCurrentLanguage(id);
  closePicker();
}

function onDocClick(ev: MouseEvent) {
  if (!pickerOpen.value) return;
  const target = ev.target as Node | null;
  if (pickerRoot.value && target && pickerRoot.value.contains(target)) return;
  closePicker();
}

watch(pickerOpen, (open) => {
  if (open) {
    document.addEventListener("mousedown", onDocClick, true);
  } else {
    document.removeEventListener("mousedown", onDocClick, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocClick, true);
});
</script>

<template>
  <footer
    class="h-6 flex items-center px-1.5 box-border"
    :style="{
      background: 'var(--panel)',
      borderTop: '1px solid var(--hairline)',
    }"
  >
    <button
      type="button"
      class="w-[22px] h-5 p-0 rounded-sm text-xs leading-none cursor-pointer bg-transparent border border-solid border-transparent"
      :style="{ color: 'var(--muted)' }"
      :aria-label="label"
      :title="label"
      :aria-expanded="collapsed ? 'false' : 'true'"
      @click="onToggle"
    >
      {{ arrow }}
    </button>

    <div class="flex-1"></div>

    <div ref="pickerRoot" class="relative">
      <button
        type="button"
        class="h-5 px-2 text-xs leading-none cursor-pointer bg-transparent border border-solid border-transparent rounded-sm tm-lang-trigger"
        :style="{ color: 'var(--muted)' }"
        :aria-haspopup="'listbox'"
        :aria-expanded="pickerOpen"
        :title="`当前语言：${currentLabel}（点击切换语法高亮）`"
        @click.stop="togglePicker"
      >
        {{ currentLabel }}
      </button>
      <div
        v-if="pickerOpen"
        class="tm-lang-panel"
        role="listbox"
        aria-label="选择文件类型"
        @click.stop
      >
        <input
          ref="filterInput"
          v-model="filter"
          type="text"
          placeholder="搜索语言..."
          class="tm-lang-search"
          @keydown.esc.prevent="closePicker"
        />
        <div class="tm-lang-list">
          <button
            v-for="opt in filteredOptions"
            :key="opt.id"
            type="button"
            class="tm-lang-item"
            :class="{ 'is-active': opt.id === currentLang }"
            role="option"
            :aria-selected="opt.id === currentLang"
            @click="pickLanguage(opt.id)"
          >
            <span>{{ opt.label }}</span>
            <span class="tm-lang-id">{{ opt.id }}</span>
          </button>
          <div v-if="filteredOptions.length === 0" class="tm-lang-empty">
            无匹配项
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
button:hover {
  color: var(--text) !important;
  border-color: var(--hairline) !important;
}

.tm-lang-trigger {
  min-width: 80px;
  text-align: right;
}

.tm-lang-panel {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 240px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  padding: 4px;
  z-index: 1003;
}

.tm-lang-search {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  margin-bottom: 4px;
  background: var(--panel-input);
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 2px;
  outline: none;
  font-size: 12px;
}

.tm-lang-search:focus {
  border-color: var(--accent);
}

.tm-lang-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.tm-lang-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 5px 8px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
}

.tm-lang-item:hover {
  background: var(--hover-bg);
  color: var(--text) !important;
  border-color: transparent !important;
}

.tm-lang-item.is-active {
  background: var(--active-row-bg);
  color: var(--text);
}

.tm-lang-id {
  color: var(--muted);
  font-size: 11px;
  font-family: Consolas, "Courier New", monospace;
}

.tm-lang-empty {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
</style>
