<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { parseMarkdownOutline, type OutlineItem } from "./parser";
import { isMarkdownTab, jumpToOutlineItem } from "./shared";

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

function onClickItem(item: OutlineItem) {
  jumpToOutlineItem(item);
}
</script>

<template>
  <div class="outline-content">
    <template v-if="!current">
      <p class="outline-empty">没有打开的文件</p>
    </template>
    <template v-else-if="!isMarkdown">
      <p class="outline-empty">当前文件不是 Markdown</p>
    </template>
    <template v-else-if="items.length === 0">
      <p class="outline-empty">未识别到标题</p>
    </template>
    <ul v-else class="outline-list">
      <li
        v-for="item in items"
        :key="`${item.index}-${item.line}`"
        class="outline-item"
        :class="`outline-item--h${item.level}`"
        :style="{ paddingLeft: 8 + (item.level - 1) * 12 + 'px' }"
        :title="item.text"
        @click="onClickItem(item)"
      >
        {{ item.text }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.outline-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
  font-size: 12px;
  color: var(--text);
}

.outline-empty {
  padding: 16px 12px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  margin: 0;
}

.outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.outline-item {
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
  line-height: 1.6;
  border-radius: 3px;
  margin: 0 4px;
}

.outline-item:hover {
  background: var(--hover-bg);
}

.outline-item--h1 { font-weight: 600; }
.outline-item--h2 { font-weight: 500; }
.outline-item--h3,
.outline-item--h4,
.outline-item--h5,
.outline-item--h6 {
  color: var(--muted);
}
</style>
