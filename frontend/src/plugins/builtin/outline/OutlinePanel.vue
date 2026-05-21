<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { sidePanelRegistry } from "@/plugins/core";
import { parseMarkdownOutline, type OutlineItem } from "./parser";
import { PANEL_ID, isMarkdownTab, jumpToOutlineItem } from "./shared";

const tabs = useTabsStore();
const { current } = storeToRefs(tabs);

const items = ref<OutlineItem[]>([]);
let pending: ReturnType<typeof setTimeout> | null = null;

function schedule(text: string) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    items.value = parseMarkdownOutline(text || "");
    pending = null;
  }, 200);
}

watch(
  () => [current.value?.id, current.value?.text] as const,
  ([, text]) => {
    if (!current.value || !isMarkdownTab(current.value)) {
      items.value = [];
      return;
    }
    schedule(text || "");
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (pending) clearTimeout(pending);
});

const isMarkdown = computed(() => isMarkdownTab(current.value));

function refresh() {
  if (!current.value) return;
  items.value = parseMarkdownOutline(current.value.text || "");
}

function close() {
  sidePanelRegistry.setVisible(PANEL_ID, false);
}

function onClickItem(item: OutlineItem) {
  jumpToOutlineItem(item);
}
</script>

<template>
  <aside class="tm-outline">
    <header class="tm-outline__header">
      <span class="tm-outline__title">大纲</span>
      <span class="tm-outline__spacer" />
      <button class="tm-outline__btn" type="button" title="刷新" @click="refresh">
        ↻
      </button>
      <button class="tm-outline__btn" type="button" title="关闭" @click="close">
        ×
      </button>
    </header>

    <div class="tm-outline__body">
      <template v-if="!current">
        <p class="tm-outline__empty">没有打开的文件</p>
      </template>
      <template v-else-if="!isMarkdown">
        <p class="tm-outline__empty">当前文件不是 Markdown</p>
      </template>
      <template v-else-if="items.length === 0">
        <p class="tm-outline__empty">未识别到标题</p>
      </template>
      <ul v-else class="tm-outline__list">
        <li
          v-for="item in items"
          :key="`${item.index}-${item.line}`"
          class="tm-outline__item"
          :class="`tm-outline__item--h${item.level}`"
          :style="{ paddingLeft: 8 + (item.level - 1) * 12 + 'px' }"
          :title="item.text"
          @click="onClickItem(item)"
        >
          {{ item.text }}
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.tm-outline {
  width: 220px;
  height: 100%;
  border-right: 1px solid var(--hairline);
  background: var(--panel, var(--bg));
  color: var(--text);
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-size: 12px;
}
.tm-outline__header {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--hairline);
  height: 30px;
  flex-shrink: 0;
  gap: 4px;
}
.tm-outline__title {
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 11px;
}
.tm-outline__spacer { flex: 1; }
.tm-outline__btn {
  background: transparent;
  color: var(--muted);
  border: none;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
}
.tm-outline__btn:hover {
  background: var(--overlay, rgba(127,127,127,0.12));
  color: var(--text);
}

.tm-outline__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
}

.tm-outline__empty {
  padding: 16px 12px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  margin: 0;
}

.tm-outline__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tm-outline__item {
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
  line-height: 1.5;
}
.tm-outline__item:hover {
  background: var(--overlay, rgba(127,127,127,0.12));
}

.tm-outline__item--h1 { font-weight: 600; }
.tm-outline__item--h2 { font-weight: 500; }
.tm-outline__item--h3,
.tm-outline__item--h4,
.tm-outline__item--h5,
.tm-outline__item--h6 {
  color: var(--muted);
}
</style>
