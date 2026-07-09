<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

export interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  category?: string;
  keybinding?: string;
}

const props = defineProps<{
  visible: boolean;
  items: PaletteItem[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "select", item: PaletteItem): void;
  (e: "close"): void;
}>();

const query = ref("");
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return props.items;
  const terms = q.split(/\s+/);
  return props.items.filter((item) => {
    const haystack = (
      (item.category || "") +
      " " +
      item.label +
      " " +
      (item.detail || "")
    ).toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
});

watch(
  () => props.visible,
  (v) => {
    if (v) {
      query.value = "";
      selectedIndex.value = 0;
      nextTick(() => inputRef.value?.focus());
    }
  },
);

watch(query, () => {
  selectedIndex.value = 0;
});

function onKeydown(ev: KeyboardEvent) {
  const len = filtered.value.length;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % Math.max(len, 1);
    scrollToSelected();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + Math.max(len, 1)) % Math.max(len, 1);
    scrollToSelected();
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    const item = filtered.value[selectedIndex.value];
    if (item) emit("select", item);
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    emit("close");
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = listRef.value?.querySelector("[data-selected]");
    el?.scrollIntoView({ block: "nearest" });
  });
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="palette-backdrop"
      @mousedown.self="emit('close')"
    >
      <div class="palette-container">
        <input
          ref="inputRef"
          v-model="query"
          :placeholder="placeholder || '搜索...'"
          class="palette-input"
          @keydown="onKeydown"
        />
        <div ref="listRef" class="palette-list">
          <div
            v-for="(item, idx) in filtered"
            :key="item.id"
            class="palette-item"
            :class="{ selected: idx === selectedIndex }"
            :data-selected="idx === selectedIndex ? '' : undefined"
            @mouseenter="selectedIndex = idx"
            @click="emit('select', item)"
          >
            <span class="palette-item-label">
              <span v-if="item.category" class="palette-item-category"
                >{{ item.category }}:</span
              >
              {{ item.label }}
            </span>
            <span v-if="item.detail" class="palette-item-detail">{{
              item.detail
            }}</span>
            <span v-if="item.keybinding" class="palette-item-keybinding">{{
              item.keybinding
            }}</span>
          </div>
          <div v-if="filtered.length === 0" class="palette-empty">
            没有匹配的结果
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  padding-top: 60px;
  background: var(--overlay);
}

.palette-container {
  width: min(560px, 90vw);
  max-height: 420px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  background: var(--panel-elevated);
  border: 1px solid var(--hairline);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.palette-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: none;
  border-bottom: 1px solid var(--hairline);
  background: var(--panel-input);
  color: var(--text);
  outline: none;
}

.palette-input::placeholder {
  color: var(--muted);
}

.palette-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.palette-item:hover {
  background: var(--hover-bg);
}

.palette-item.selected {
  background: var(--active-row-bg);
}

.palette-item-category {
  color: var(--muted);
  margin-right: 2px;
}

.palette-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-detail {
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-keybinding {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--hover-bg);
  border: 1px solid var(--hairline);
  color: var(--muted);
  flex-shrink: 0;
}

.palette-empty {
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
