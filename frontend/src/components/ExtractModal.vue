<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { backend } from "@/api/backend";
import type { extract, main } from "@wails/go/models";

type Mode = "filter" | "capture" | "block";

const props = defineProps<{
  visible: boolean;
  source: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "insert", text: string): void;
  (e: "new-tab", text: string): void;
}>();

const mode = ref<Mode>("filter");
const pattern = ref("");
const useRegex = ref(false);
const caseInsensitive = ref(false);
const invert = ref(false);
const dedup = ref(false);
const captureGroup = ref(1);
const joiner = ref("\\n");
const blockEnd = ref("");
const includeBoundary = ref(false);

const errorMsg = ref("");
const previewText = ref("");
const matchCount = ref(0);
const lineCount = ref(0);
const pending = ref(false);
const lastResultText = ref("");

const patternRef = ref<HTMLInputElement | null>(null);

const PREVIEW_MAX_LINES = 200;

const previewDisplay = computed(() => {
  if (!previewText.value) return "";
  const lines = previewText.value.split("\n");
  if (lines.length <= PREVIEW_MAX_LINES) return previewText.value;
  return (
    lines.slice(0, PREVIEW_MAX_LINES).join("\n") +
    `\n... (仅显示前 ${PREVIEW_MAX_LINES} 行 / 共 ${lines.length} 行)`
  );
});

const summary = computed(() => {
  if (errorMsg.value) return "";
  if (!lastResultText.value && matchCount.value === 0 && lineCount.value === 0)
    return "";
  return `命中 ${matchCount.value} 处，输出 ${lineCount.value} 行`;
});

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      errorMsg.value = "";
      previewText.value = "";
      lastResultText.value = "";
      matchCount.value = 0;
      lineCount.value = 0;
      await nextTick();
      patternRef.value?.focus();
    }
  },
);

function decodeJoiner(raw: string): string {
  if (!raw) return "\n";
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

function buildOptions(): extract.Options {
  return {
    mode: mode.value,
    pattern: pattern.value,
    useRegex: useRegex.value,
    caseInsensitive: caseInsensitive.value,
    invert: invert.value,
    dedup: dedup.value,
    captureGroup: Number(captureGroup.value) || 0,
    joiner: decodeJoiner(joiner.value),
    blockEnd: blockEnd.value,
    includeBoundary: includeBoundary.value,
  } as extract.Options;
}

async function runPreview(): Promise<main.ExtractResult | null> {
  if (!pattern.value.trim()) {
    errorMsg.value = "请输入提取模式";
    return null;
  }
  if (!props.source) {
    errorMsg.value = "没有可提取的文本";
    return null;
  }
  pending.value = true;
  try {
    const res = await backend.extractFromText(props.source, buildOptions());
    if (res?.error) {
      errorMsg.value = res.error;
      previewText.value = "";
      lastResultText.value = "";
      matchCount.value = 0;
      lineCount.value = 0;
      return null;
    }
    errorMsg.value = "";
    previewText.value = res?.text ?? "";
    lastResultText.value = res?.text ?? "";
    matchCount.value = Number(res?.matchCount) || 0;
    lineCount.value = Number(res?.lineCount) || 0;
    return res;
  } catch (err) {
    errorMsg.value = (err as Error)?.message || "提取失败";
    return null;
  } finally {
    pending.value = false;
  }
}

async function onPreview() {
  await runPreview();
}

async function onApply(target: "insert" | "new-tab") {
  const res = await runPreview();
  if (!res) return;
  if (target === "insert") emit("insert", lastResultText.value);
  else emit("new-tab", lastResultText.value);
}

function close() {
  emit("close");
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1200]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="close"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-auto p-3.5 box-border rounded-md border"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(900px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="提取文本"
    >
      <div class="text-[15px] mb-2" :style="{ color: 'var(--text)' }">
        提取文本
      </div>

      <div class="flex gap-1 mb-3" role="tablist" aria-label="提取模式">
        <button
          v-for="m in [
            { id: 'filter', label: '过滤行' },
            { id: 'capture', label: '捕获提取' },
            { id: 'block', label: '块提取' },
          ]"
          :key="m.id"
          class="h-7 px-3 text-[13px] cursor-pointer rounded-sm border"
          :style="
            mode === m.id
              ? {
                  background: 'var(--active-row-bg)',
                  borderColor: 'var(--accent)',
                  color: 'var(--text)',
                }
              : {
                  background: 'transparent',
                  borderColor: 'var(--hairline)',
                  color: 'var(--muted)',
                }
          "
          role="tab"
          :aria-selected="mode === m.id"
          @click="mode = m.id as Mode"
        >
          {{ m.label }}
        </button>
      </div>

      <label
        class="block text-xs mb-1"
        :style="{ color: 'var(--muted)' }"
        for="extractPattern"
      >
        {{
          mode === "filter"
            ? "关键字 / 正则（命中的整行被保留）"
            : mode === "capture"
              ? "正则（必须含捕获组，例如 traceId=([a-f0-9]+)）"
              : "块起始 关键字 / 正则"
        }}
      </label>
      <input
        id="extractPattern"
        ref="patternRef"
        v-model="pattern"
        class="w-full h-9 px-2.5 box-border rounded-sm border text-[13px] mb-2.5 outline-none font-mono"
        :style="{
          background: 'var(--panel-input)',
          borderColor: 'var(--hairline)',
          color: 'var(--text)',
        }"
        spellcheck="false"
        @keydown.enter="onPreview"
      />

      <div class="flex flex-wrap gap-x-4 gap-y-1.5 mb-2.5 text-[13px]"
        :style="{ color: 'var(--text)' }">
        <label v-if="mode !== 'capture'" class="inline-flex items-center gap-1.5 cursor-pointer">
          <input v-model="useRegex" type="checkbox" />
          正则
        </label>
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input v-model="caseInsensitive" type="checkbox" />
          忽略大小写
        </label>
        <label v-if="mode === 'filter'" class="inline-flex items-center gap-1.5 cursor-pointer">
          <input v-model="invert" type="checkbox" />
          反向（保留不匹配的行）
        </label>
        <label v-if="mode !== 'block'" class="inline-flex items-center gap-1.5 cursor-pointer">
          <input v-model="dedup" type="checkbox" />
          结果去重
        </label>
        <label v-if="mode === 'block'" class="inline-flex items-center gap-1.5 cursor-pointer">
          <input v-model="includeBoundary" type="checkbox" />
          包含起止行
        </label>
      </div>

      <div v-if="mode === 'capture'" class="flex flex-wrap gap-3 items-center mb-2.5 text-[13px]"
        :style="{ color: 'var(--text)' }">
        <label class="inline-flex items-center gap-1.5">
          捕获组序号
          <input
            v-model.number="captureGroup"
            type="number"
            min="0"
            class="w-16 h-7 px-2 box-border rounded-sm border text-[13px] outline-none"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--hairline)',
              color: 'var(--text)',
            }"
          />
        </label>
        <label class="inline-flex items-center gap-1.5">
          分隔符
          <input
            v-model="joiner"
            class="w-24 h-7 px-2 box-border rounded-sm border text-[13px] outline-none font-mono"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--hairline)',
              color: 'var(--text)',
            }"
            placeholder="\n"
            spellcheck="false"
          />
        </label>
        <span :style="{ color: 'var(--muted)' }" class="text-xs">
          支持 \n \t \r 转义；0 表示整段命中
        </span>
      </div>

      <div v-if="mode === 'block'" class="mb-2.5">
        <label
          class="block text-xs mb-1"
          :style="{ color: 'var(--muted)' }"
          for="extractBlockEnd"
        >
          块结束 关键字 / 正则（留空表示遇空行结束）
        </label>
        <input
          id="extractBlockEnd"
          v-model="blockEnd"
          class="w-full h-9 px-2.5 box-border rounded-sm border text-[13px] outline-none font-mono"
          :style="{
            background: 'var(--panel-input)',
            borderColor: 'var(--hairline)',
            color: 'var(--text)',
          }"
          spellcheck="false"
        />
        <label class="inline-flex items-center gap-1.5 cursor-pointer text-[13px] mt-1.5"
          :style="{ color: 'var(--text)' }">
          <input v-model="useRegex" type="checkbox" />
          正则（同时作用于起始与结束）
        </label>
      </div>

      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs" :style="{ color: 'var(--muted)' }">
          预览
        </span>
        <span class="text-xs" :style="{ color: 'var(--muted)' }">
          {{ summary }}
        </span>
      </div>
      <textarea
        :value="previewDisplay"
        class="tm-input"
        readonly
        spellcheck="false"
        :style="{ minHeight: '180px' }"
      ></textarea>

      <div
        class="min-h-[18px] text-xs mb-2"
        :style="{ color: '#f08f8f' }"
      >
        {{ errorMsg }}
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="pending"
          @click="onPreview"
        >
          预览
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="pending"
          @click="onApply('insert')"
        >
          替换选区
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="pending"
          @click="onApply('new-tab')"
        >
          新建Tab输出
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          @click="close"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>
