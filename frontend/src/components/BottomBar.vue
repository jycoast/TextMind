<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import {
  LANGUAGE_OPTIONS,
  getLanguageLabel,
} from "@/composables/useLanguageOptions";
import { backend } from "@/api/backend";
import type { EncodingMeta } from "@/types";

const tabs = useTabsStore();
const ui = useUiStore();
const { current, adapter } = storeToRefs(tabs);

const currentLang = computed(() => current.value?.language || "plaintext");
const currentLabel = computed(() => getLanguageLabel(currentLang.value));

// ---- 行/列 + 选区统计 ----
const cursorLine = ref(1);
const cursorColumn = ref(1);
const selectionLineCount = ref(0);
const selectionCharCount = ref(0);
const selectionByteCount = ref(0);
const hasSelection = ref(false);

function refreshCursor() {
  const a = tabs.adapter;
  if (!a) {
    cursorLine.value = 1;
    cursorColumn.value = 1;
    hasSelection.value = false;
    selectionLineCount.value = 0;
    selectionCharCount.value = 0;
    selectionByteCount.value = 0;
    return;
  }
  const pos = a.getCursorPosition();
  cursorLine.value = pos.line;
  cursorColumn.value = pos.column;
  const stats = a.getSelectionStats();
  hasSelection.value = stats.hasSelection;
  selectionLineCount.value = stats.lineCount;
  selectionCharCount.value = stats.charCount;
  selectionByteCount.value = stats.byteCount;
}

// (Re)subscribe whenever the adapter instance changes (initial mount, tab
// editor hot-swap, etc.). Monaco fires our cursor-change handler for both
// cursor movement and content edits, so byte/char counts stay live.
watch(
  adapter,
  (next) => {
    if (!next) {
      refreshCursor();
      return;
    }
    next.onCursorChange(refreshCursor);
    refreshCursor();
  },
  { immediate: true },
);

// When the user switches tabs (current changes) the adapter object stays the
// same instance but its content/selection are reset by renderCurrentIntoEditor;
// pull the latest snapshot so the bottom bar updates immediately.
watch(
  () => current.value?.id,
  () => refreshCursor(),
);

// ---- 文件大小 ----
const utf8Encoder = new TextEncoder();

const fileByteCount = computed(() =>
  utf8Encoder.encode(current.value?.text || "").byteLength,
);

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const fileSizeLabel = computed(() => formatBytes(fileByteCount.value));

// ---- 编码 ----
const encodingOptions = ref<EncodingMeta[]>([]);

onMounted(async () => {
  try {
    const list = await backend.listSupportedEncodings();
    encodingOptions.value = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("[encoding] failed to load supported encodings", err);
  }
});

const currentEncoding = computed(() => current.value?.encoding || "utf-8");
const currentHasBOM = computed(() => Boolean(current.value?.hasBOM));

const encodingLabel = computed(() => {
  const id = currentEncoding.value;
  const meta = encodingOptions.value.find((e) => e.id === id);
  // Use just the short uppercased ID by default; UTF-8 BOM is special-cased.
  if (id === "utf-8-bom") return "UTF-8 BOM";
  if (id === "utf-8") return currentHasBOM.value ? "UTF-8 BOM" : "UTF-8";
  if (meta?.label) {
    // Take the part before whitespace for compact status-bar display.
    const head = meta.label.split(/\s+/)[0];
    return head || meta.label;
  }
  return id.toUpperCase();
});

const encodingTitle = computed(() => {
  const id = currentEncoding.value;
  const meta = encodingOptions.value.find((e) => e.id === id);
  const base = meta?.label || id;
  const bom = currentHasBOM.value ? "（含 BOM）" : "";
  const hint = current.value?.path
    ? "（点击以指定编码重新打开）"
    : "（当前为未保存文件，不支持切换编码）";
  return `当前编码：${base}${bom}${hint}`;
});

// ---- 编码选择器 ----
const encodingPickerOpen = ref(false);
const encodingPickerRoot = ref<HTMLElement | null>(null);
const encodingBusy = ref(false);

const groupedEncodings = computed(() => {
  const groups: { name: string; items: EncodingMeta[] }[] = [];
  for (const item of encodingOptions.value) {
    const g = groups.find((x) => x.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
});

function openEncodingPicker() {
  encodingPickerOpen.value = true;
}

function closeEncodingPicker() {
  encodingPickerOpen.value = false;
}

function toggleEncodingPicker() {
  if (encodingPickerOpen.value) closeEncodingPicker();
  else openEncodingPicker();
}

async function pickEncoding(id: string) {
  if (encodingBusy.value) return;
  if (!current.value?.path) {
    ui.showTip("未保存的文件不支持切换编码，请先保存");
    closeEncodingPicker();
    return;
  }
  if (id === currentEncoding.value) {
    closeEncodingPicker();
    return;
  }
  encodingBusy.value = true;
  try {
    const res = await tabs.reopenCurrentWithEncoding(id);
    if (res.ok) {
      const meta = encodingOptions.value.find((e) => e.id === id);
      ui.showTip(`已用 ${meta?.label || id} 重新打开`);
    } else if (res.error) {
      ui.showTip(res.error);
    }
  } finally {
    encodingBusy.value = false;
    closeEncodingPicker();
  }
}

function onEncodingDocClick(ev: MouseEvent) {
  if (!encodingPickerOpen.value) return;
  const target = ev.target as Node | null;
  if (
    encodingPickerRoot.value &&
    target &&
    encodingPickerRoot.value.contains(target)
  )
    return;
  closeEncodingPicker();
}

watch(encodingPickerOpen, (open) => {
  if (open) {
    document.addEventListener("mousedown", onEncodingDocClick, true);
  } else {
    document.removeEventListener("mousedown", onEncodingDocClick, true);
  }
});

// ---- 语言选择器 ----
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
  document.removeEventListener("mousedown", onEncodingDocClick, true);
});
</script>

<template>
  <footer
    class="h-6 flex items-center px-1.5 box-border gap-1"
    :style="{
      background: 'var(--panel)',
      borderTop: '1px solid var(--hairline)',
    }"
  >
    <div class="flex-1"></div>

    <div
      class="tm-status-item"
      :style="{ color: 'var(--muted)' }"
      :title="`当前光标位置：第 ${cursorLine} 行，第 ${cursorColumn} 列`"
    >
      行 {{ cursorLine }}, 列 {{ cursorColumn }}
    </div>

    <span
      v-if="hasSelection"
      class="tm-status-sep"
      :style="{ background: 'var(--hairline)' }"
    ></span>
    <div
      v-if="hasSelection"
      class="tm-status-item"
      :style="{ color: 'var(--muted)' }"
      :title="`选区：${selectionLineCount} 行 / ${selectionCharCount} 字符 / ${selectionByteCount} UTF-8 字节`"
    >
      选区 {{ selectionLineCount }} 行 · {{ selectionCharCount }} 字符 ·
      {{ selectionByteCount }} 字节
    </div>

    <span
      class="tm-status-sep"
      :style="{ background: 'var(--hairline)' }"
    ></span>
    <div
      class="tm-status-item"
      :style="{ color: 'var(--muted)' }"
      :title="`当前文档大小（按 UTF-8 编码）：${fileByteCount} 字节`"
    >
      {{ fileSizeLabel }}
    </div>

    <span
      class="tm-status-sep"
      :style="{ background: 'var(--hairline)' }"
    ></span>
    <div ref="encodingPickerRoot" class="relative">
      <button
        type="button"
        class="h-5 px-2 text-xs leading-none cursor-pointer bg-transparent border border-solid border-transparent rounded-sm tm-enc-trigger"
        :style="{ color: 'var(--muted)' }"
        :aria-haspopup="'listbox'"
        :aria-expanded="encodingPickerOpen"
        :title="encodingTitle"
        @click.stop="toggleEncodingPicker"
      >
        {{ encodingLabel }}
      </button>
      <div
        v-if="encodingPickerOpen"
        class="tm-enc-panel"
        role="listbox"
        aria-label="选择文本编码"
        @click.stop
      >
        <div class="tm-enc-header">
          <div class="tm-enc-title">以指定编码重新打开</div>
          <div class="tm-enc-sub">
            {{
              current?.path
                ? "选择编码以重新读取磁盘文件"
                : "请先保存当前文件后再切换编码"
            }}
          </div>
        </div>
        <div class="tm-enc-list">
          <template v-for="group in groupedEncodings" :key="group.name">
            <div class="tm-enc-group">{{ group.name }}</div>
            <button
              v-for="opt in group.items"
              :key="opt.id"
              type="button"
              class="tm-enc-item"
              :class="{ 'is-active': opt.id === currentEncoding }"
              :disabled="!current?.path || encodingBusy"
              role="option"
              :aria-selected="opt.id === currentEncoding"
              :title="opt.label"
              @click="pickEncoding(opt.id)"
            >
              <span>{{ opt.label }}</span>
              <span class="tm-enc-id">{{ opt.id }}</span>
            </button>
          </template>
          <div v-if="encodingOptions.length === 0" class="tm-enc-empty">
            正在加载编码列表...
          </div>
        </div>
      </div>
    </div>

    <span
      class="tm-status-sep"
      :style="{ background: 'var(--hairline)' }"
    ></span>
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

.tm-status-item {
  height: 20px;
  line-height: 20px;
  padding: 0 6px;
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.tm-status-sep {
  display: inline-block;
  width: 1px;
  height: 12px;
  margin: 0 2px;
  opacity: 0.6;
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

.tm-enc-trigger {
  min-width: 64px;
  text-align: right;
}

.tm-enc-panel {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 260px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  padding: 4px;
  z-index: 1003;
}

.tm-enc-header {
  padding: 6px 8px 4px;
  border-bottom: 1px solid var(--hairline);
  margin-bottom: 4px;
}

.tm-enc-title {
  font-size: 12px;
  color: var(--text);
}

.tm-enc-sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.tm-enc-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.tm-enc-group {
  padding: 4px 8px 2px;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tm-enc-item {
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

.tm-enc-item:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text) !important;
  border-color: transparent !important;
}

.tm-enc-item.is-active {
  background: var(--active-row-bg);
  color: var(--text);
}

.tm-enc-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tm-enc-id {
  color: var(--muted);
  font-size: 11px;
  font-family: Consolas, "Courier New", monospace;
}

.tm-enc-empty {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
</style>
