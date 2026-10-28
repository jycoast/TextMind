<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { parseMarkdownOutline, type OutlineItem } from "./parser";
import { isMarkdownTab, jumpToOutlineItem } from "./shared";

const tabs = useTabsStore();
const { current, adapter } = storeToRefs(tabs);

// --- Parsing ---------------------------------------------------------------
const items = ref<OutlineItem[]>([]);
let pending: ReturnType<typeof setTimeout> | null = null;

function schedule(text: string) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    items.value = parseMarkdownOutline(text || "");
    updateActive();
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

// --- Collapse / filter state ----------------------------------------------
const collapsed = ref(new Set<number>());
const filterText = ref("");

interface TreeNode {
  item: OutlineItem;
  children: TreeNode[];
}

// Build a heading hierarchy from the flat, source-ordered items.
function buildTree(list: OutlineItem[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const item of list) {
    const node: TreeNode = { item, children: [] };
    while (stack.length && stack[stack.length - 1].item.level >= item.level) {
      stack.pop();
    }
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

const tree = computed(() => buildTree(items.value));

// Heading texts that appear more than once. Used to disambiguate identical
// headings by their source line number.
const duplicateTexts = computed(() => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items.value) {
    if (seen.has(item.text)) dupes.add(item.text);
    else seen.add(item.text);
  }
  return dupes;
});

interface Row {
  item: OutlineItem;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** True when another heading shares this row's text (show a line suffix). */
  dup: boolean;
}

const visible = computed<Row[]>(() => {
  const q = filterText.value.trim().toLocaleLowerCase();
  if (q) {
    // Filter mode: show matching headings (ignoring collapse), indented by level.
    return items.value
      .filter((item) => item.text.toLocaleLowerCase().includes(q))
      .map((item) => ({
        item,
        depth: item.level - 1,
        hasChildren: false,
        collapsed: false,
        dup: duplicateTexts.value.has(item.text),
      }));
  }
  const rows: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      const isCollapsed = collapsed.value.has(n.item.index);
      rows.push({
        item: n.item,
        depth,
        hasChildren: n.children.length > 0,
        collapsed: isCollapsed,
        dup: duplicateTexts.value.has(n.item.text),
      });
      if (n.children.length && !isCollapsed) walk(n.children, depth + 1);
    }
  };
  walk(tree.value, 0);
  return rows;
});

function toggleCollapse(index: number) {
  const next = new Set(collapsed.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  collapsed.value = next;
}

function expandAll() {
  collapsed.value = new Set();
}

function collapseAll() {
  collapsed.value = new Set(items.value.map((item) => item.index));
}

// Auto-reveal the ancestors of a heading so the current section stays visible
// even when its parent was folded.
function expandAncestorsOf(index: number) {
  if (!tree.value.length) return;
  const path: number[] = [];
  let found = false;
  const find = (nodes: TreeNode[]): void => {
    if (found) return;
    for (const n of nodes) {
      if (found) return;
      if (n.item.index === index) {
        found = true;
        return;
      }
      if (n.children.length) {
        path.push(n.item.index);
        find(n.children);
        if (!found) path.pop();
      }
    }
  };
  find(tree.value);
  if (!found) return;
  const next = new Set(collapsed.value);
  let changed = false;
  for (const p of path) if (next.delete(p)) changed = true;
  if (changed) collapsed.value = next;
}

// --- Active heading (follow cursor / click feedback) ----------------------
const activeIndex = ref(-1);

function computeActiveIndex(): number {
  const a = adapter.value;
  if (!a || !items.value.length) return -1;
  // Tree-based editors report the heading index directly (front-matter safe).
  if (typeof a.getCursorHeadingIndex === "function") {
    return a.getCursorHeadingIndex();
  }
  // Line-addressable editors (Monaco): last heading at or above the caret line.
  if (typeof a.getCursorPosition === "function") {
    const line = a.getCursorPosition().line;
    let idx = -1;
    for (const item of items.value) {
      if (item.line <= line) idx = item.index;
      else break;
    }
    return idx;
  }
  return -1;
}

function updateActive() {
  const idx = computeActiveIndex();
  if (idx !== activeIndex.value) {
    activeIndex.value = idx;
    if (idx >= 0 && !filterText.value.trim()) expandAncestorsOf(idx);
  }
}

// Subscribe once per adapter instance. `onCursorChange` has no unsubscribe,
// so guard by identity to avoid stacking handlers on a reused adapter.
let subscribedAdapter: unknown = null;
watch(
  () => adapter.value,
  (a) => {
    if (a === subscribedAdapter) return;
    subscribedAdapter = a;
    a?.onCursorChange?.(updateActive);
    updateActive();
  },
  { flush: "post" },
);

// --- Keyboard navigation ---------------------------------------------------
const listRef = ref<HTMLElement | null>(null);
const focusIndex = ref(-1);

function clampFocus() {
  if (focusIndex.value >= visible.value.length) {
    focusIndex.value = Math.max(-1, visible.value.length - 1);
  }
  if (focusIndex.value < -1) focusIndex.value = -1;
}

watch(visible, () => {
  if (filterText.value.trim()) {
    if (focusIndex.value < 0) focusIndex.value = 0;
  }
  clampFocus();
  scrollFocusedIntoView();
}, { flush: "post" });

function scrollFocusedIntoView() {
  if (focusIndex.value < 0 || !listRef.value) return;
  const el = listRef.value.querySelector(
    `[data-index="${visible.value[focusIndex.value]?.item.index}"]`,
  ) as HTMLElement | null;
  el?.scrollIntoView({ block: "nearest" });
}

function scrollActiveIntoView() {
  if (activeIndex.value < 0 || !listRef.value) return;
  const el = listRef.value.querySelector(
    `[data-index="${activeIndex.value}"]`,
  ) as HTMLElement | null;
  el?.scrollIntoView({ block: "nearest" });
}

watch([activeIndex, visible], scrollActiveIntoView, { flush: "post" });

function moveFocus(delta: number) {
  if (!visible.value.length) return;
  if (focusIndex.value < 0) focusIndex.value = delta > 0 ? 0 : visible.value.length - 1;
  focusIndex.value = (focusIndex.value + delta + visible.value.length) % visible.value.length;
  scrollFocusedIntoView();
}

function jumpRow(index: number) {
  const row = visible.value[index];
  if (!row) return;
  activeIndex.value = row.item.index;
  focusIndex.value = index;
  jumpToOutlineItem(row.item);
}

function onListKeydown(event: KeyboardEvent) {
  if (!visible.value.length) return;
  const row = visible.value[focusIndex.value];
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveFocus(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(-1);
      break;
    case "Home":
      event.preventDefault();
      focusIndex.value = 0;
      scrollFocusedIntoView();
      break;
    case "End":
      event.preventDefault();
      focusIndex.value = visible.value.length - 1;
      scrollFocusedIntoView();
      break;
    case "Enter":
      event.preventDefault();
      if (row) jumpRow(focusIndex.value);
      break;
    case "ArrowRight":
      event.preventDefault();
      if (row?.hasChildren && row.collapsed) {
        toggleCollapse(row.item.index);
        focusIndex.value = focusIndex.value; // keep position
      }
      break;
    case "ArrowLeft":
      event.preventDefault();
      if (row?.hasChildren && !row.collapsed) {
        toggleCollapse(row.item.index);
      }
      break;
    case "Escape":
      if (filterText.value.trim()) {
        filterText.value = "";
        listRef.value?.blur();
      } else {
        listRef.value?.blur();
      }
      break;
  }
}

function onFilterKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveFocus(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(-1);
      break;
    case "Enter":
      event.preventDefault();
      if (visible.value.length) jumpRow(focusIndex.value >= 0 ? focusIndex.value : 0);
      break;
    case "Escape":
      filterText.value = "";
      (event.target as HTMLElement).blur();
      break;
  }
}

onMounted(() => {
  updateActive();
});

onBeforeUnmount(() => {
  if (pending) clearTimeout(pending);
  subscribedAdapter = null;
});

const isMarkdown = computed(() => isMarkdownTab(current.value));
</script>

<template>
  <div class="outline-content">
    <template v-if="!current">
      <p class="outline-empty">没有打开的文件</p>
    </template>
    <template v-else-if="!isMarkdown">
      <p class="outline-empty">当前文件不是 Markdown</p>
    </template>
    <template v-else>
      <div class="outline-toolbar">
        <input
          v-model="filterText"
          class="outline-filter"
          type="text"
          placeholder="过滤标题…"
          spellcheck="false"
          @keydown="onFilterKeydown"
        />
        <button class="outline-toolbar-btn" title="全部展开" @click="expandAll">⇊</button>
        <button class="outline-toolbar-btn" title="全部折叠" @click="collapseAll">⇈</button>
        <span class="outline-count" :title="items.length + ' 个标题'">{{ items.length }}</span>
      </div>
      <p v-if="items.length === 0" class="outline-empty">未识别到标题</p>
      <p v-else-if="visible.length === 0" class="outline-empty">无匹配标题</p>
      <ul
        v-else
        ref="listRef"
        class="outline-list"
        tabindex="-1"
        @keydown="onListKeydown"
      >
        <li
          v-for="(row, i) in visible"
          :key="row.item.index"
          :data-index="row.item.index"
          class="outline-item"
          :class="{
            [`outline-item--h${row.item.level}`]: true,
            'is-active': row.item.index === activeIndex,
            'is-focused': i === focusIndex,
          }"
          :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
          :title="row.item.text + (row.dup ? ' · 第 ' + row.item.line + ' 行' : '')"
          @click="jumpRow(i)"
        >
          <span
            class="outline-caret"
            :class="{
              'is-leaf': !row.hasChildren,
              'is-collapsed': row.collapsed,
            }"
            @click.stop="row.hasChildren && toggleCollapse(row.item.index)"
          >▸</span>
          <span class="outline-text">{{ row.item.text }}</span>
          <span v-if="row.dup" class="outline-lineno">L{{ row.item.line }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.outline-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.outline-toolbar {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px 6px;
  flex-shrink: 0;
}

.outline-filter {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: var(--panel-input);
  color: var(--text);
  font-size: 12px;
  outline: none;
}

.outline-filter:focus {
  border-color: var(--accent);
}

.outline-toolbar-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.outline-toolbar-btn:hover {
  background: var(--hover-bg);
  color: var(--text);
}

.outline-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  padding: 0 4px;
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.outline-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
  outline: none;
}

.outline-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 3px;
  margin: 0 4px;
  line-height: 1.6;
}

.outline-caret {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  font-size: 10px;
  color: var(--muted);
  transform: rotate(0deg);
  transition: transform 0.12s ease;
  user-select: none;
}

.outline-caret.is-collapsed {
  transform: rotate(-90deg);
}

.outline-caret.is-leaf {
  visibility: hidden;
}

.outline-text {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.outline-lineno {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.outline-item:hover {
  background: var(--hover-bg);
}

.outline-item.is-focused {
  outline: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: -1px;
}

.outline-item.is-active {
  background: var(--active-row-bg);
}

.outline-item--h1 .outline-text { font-weight: 600; }
.outline-item--h2 .outline-text { font-weight: 500; }
.outline-item--h3 .outline-text,
.outline-item--h4 .outline-text,
.outline-item--h5 .outline-text,
.outline-item--h6 .outline-text {
  color: var(--muted);
}
</style>
