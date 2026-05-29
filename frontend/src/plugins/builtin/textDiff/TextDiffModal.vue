<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import * as monaco from "monaco-editor";
import { useThemeStore } from "@/stores/theme";

// Full-screen modal that hosts a Monaco DiffEditor. Both panes are editable
// so the user can paste / tweak text freely. Closing the modal disposes the
// diff editor + both models to release the underlying webworkers.
//
// IMPORTANT: do NOT declare `onClose` / `onCopyToNewTab` as props. The plugin
// host (`PluginModals.vue`) spreads the spec via `v-bind="m.props"`, and Vue 3
// routes any `onXxx` key from that object as an event listener rather than as
// a prop. We therefore expose them as emits and let the host wire them via
// `@close` / `@copy-to-new-tab`.
const props = defineProps<{
  visible: boolean;
  initialLeft: string;
  initialRight: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "copy-to-new-tab", text: string): void;
}>();

const containerEl = ref<HTMLDivElement | null>(null);
const diffEditor = shallowRef<monaco.editor.IStandaloneDiffEditor | null>(null);
const originalModel = shallowRef<monaco.editor.ITextModel | null>(null);
const modifiedModel = shallowRef<monaco.editor.ITextModel | null>(null);

const ignoreWS = ref(true);
const sideBySide = ref(true);

const theme = useThemeStore();

onMounted(() => {
  if (!containerEl.value) return;
  originalModel.value = monaco.editor.createModel(
    props.initialLeft || "",
    "plaintext",
  );
  modifiedModel.value = monaco.editor.createModel(
    props.initialRight || "",
    "plaintext",
  );
  diffEditor.value = monaco.editor.createDiffEditor(containerEl.value, {
    theme: theme.monacoThemeName,
    automaticLayout: true,
    renderSideBySide: sideBySide.value,
    ignoreTrimWhitespace: ignoreWS.value,
    originalEditable: true,
    readOnly: false,
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    contextmenu: false,
    renderOverviewRuler: true,
    overviewRulerBorder: false,
  });
  diffEditor.value.setModel({
    original: originalModel.value,
    modified: modifiedModel.value,
  });
});

watch(ignoreWS, (v) => {
  diffEditor.value?.updateOptions({ ignoreTrimWhitespace: v });
});

watch(sideBySide, (v) => {
  diffEditor.value?.updateOptions({ renderSideBySide: v });
});

watch(
  () => theme.monacoThemeName,
  (t) => {
    monaco.editor.setTheme(t);
  },
);

onBeforeUnmount(() => {
  try {
    diffEditor.value?.dispose();
  } catch {
    /* noop */
  }
  try {
    originalModel.value?.dispose();
    modifiedModel.value?.dispose();
  } catch {
    /* noop */
  }
  diffEditor.value = null;
  originalModel.value = null;
  modifiedModel.value = null;
});

function swap() {
  const l = originalModel.value?.getValue() ?? "";
  const r = modifiedModel.value?.getValue() ?? "";
  originalModel.value?.setValue(r);
  modifiedModel.value?.setValue(l);
}

function clearAll() {
  originalModel.value?.setValue("");
  modifiedModel.value?.setValue("");
}

// Render a minimal unified-diff style text using DiffEditor's line-change
// summary. We deliberately do not try to emulate real `git diff` (no
// surrounding context lines, no rename detection); the goal is just to
// give the user something pasteable / saveable.
function copyAsNewTab() {
  const ed = diffEditor.value;
  const orig = originalModel.value?.getLinesContent() ?? [];
  const mod = modifiedModel.value?.getLinesContent() ?? [];
  // `getLineChanges` may be missing in some monaco builds; guard it.
  const changes =
    (ed as unknown as {
      getLineChanges?: () => monaco.editor.ILineChange[] | null;
    })?.getLineChanges?.() ?? [];

  const out: string[] = ["--- original", "+++ modified"];
  if (changes.length === 0) {
    out.push("(无差异)");
  } else {
    for (const c of changes) {
      const oStart = c.originalStartLineNumber;
      const oEnd = c.originalEndLineNumber;
      const mStart = c.modifiedStartLineNumber;
      const mEnd = c.modifiedEndLineNumber;
      const oCount = oEnd >= oStart ? oEnd - oStart + 1 : 0;
      const mCount = mEnd >= mStart ? mEnd - mStart + 1 : 0;
      out.push(
        `@@ -${oStart},${oCount} +${mStart},${mCount} @@`,
      );
      for (let i = oStart; i <= oEnd && i >= 1; i++) {
        out.push("-" + (orig[i - 1] ?? ""));
      }
      for (let i = mStart; i <= mEnd && i >= 1; i++) {
        out.push("+" + (mod[i - 1] ?? ""));
      }
    }
  }
  emit("copy-to-new-tab", out.join("\n"));
}

function onOverlayMousedown(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) {
    emit("close");
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 wails-no-drag"
    @mousedown="onOverlayMousedown"
  >
    <div
      class="flex flex-col rounded shadow-xl overflow-hidden"
      :style="{
        width: '92vw',
        height: '86vh',
        background: 'var(--bg)',
        border: '1px solid var(--hairline)',
        color: 'var(--text)',
      }"
      @mousedown.stop
    >
      <!-- 工具条 -->
      <div
        class="flex items-center gap-3 px-3 h-9 flex-shrink-0"
        :style="{
          borderBottom: '1px solid var(--hairline)',
          background: 'var(--bg)',
        }"
      >
        <span
          class="text-[13px] font-medium select-none"
          :style="{ color: 'var(--text)' }"
        >文本对比</span>

        <div class="flex items-center gap-3 text-[12px]" :style="{ color: 'var(--muted)' }">
          <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input v-model="ignoreWS" type="checkbox" />
            忽略首尾空白
          </label>
          <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input v-model="sideBySide" type="checkbox" />
            左右对照
          </label>
        </div>

        <div class="flex-1" />

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="tm-menu-item"
            style="width: auto; padding: 0 10px; height: 26px; border: 1px solid var(--hairline)"
            title="交换左右两栏"
            @click="swap"
          >
            交换
          </button>
          <button
            type="button"
            class="tm-menu-item"
            style="width: auto; padding: 0 10px; height: 26px; border: 1px solid var(--hairline)"
            title="清空左右内容"
            @click="clearAll"
          >
            清空
          </button>
          <button
            type="button"
            class="tm-menu-item"
            style="width: auto; padding: 0 10px; height: 26px; border: 1px solid var(--hairline)"
            title="把差异以 unified diff 格式生成到新 Tab"
            @click="copyAsNewTab"
          >
            导出到新 Tab
          </button>
          <button
            type="button"
            class="tm-menu-item"
            style="width: auto; padding: 0 10px; height: 26px; border: 1px solid var(--hairline)"
            title="关闭 (Esc)"
            @click="emit('close')"
          >
            关闭
          </button>
        </div>
      </div>

      <!-- 列标题 -->
      <div
        v-if="sideBySide"
        class="flex text-[12px] flex-shrink-0"
        :style="{
          color: 'var(--muted)',
          borderBottom: '1px solid var(--hairline)',
        }"
      >
        <div class="flex-1 px-3 py-1 select-none">原始 (左)</div>
        <div
          class="flex-1 px-3 py-1 select-none"
          :style="{ borderLeft: '1px solid var(--hairline)' }"
        >修改后 (右)</div>
      </div>

      <!-- DiffEditor 容器 -->
      <div ref="containerEl" class="flex-1 min-h-0 w-full" />
    </div>
  </div>
</template>

<style scoped>
/* DiffEditor 内部 monaco 元素自带样式；这里只确保容器铺满父级。 */
</style>
