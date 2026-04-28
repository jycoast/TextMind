<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAIConfigStore } from "@/stores/aiConfig";
import { useAIChat, type InlineHandle } from "@/composables/useAIChat";

interface Preset {
  id: string;
  label: string;
  prompt: string;
}

const PRESETS: Preset[] = [
  {
    id: "polish",
    label: "润色",
    prompt: "请润色下面的文本，使表达更清晰准确，仅返回润色后的内容：",
  },
  {
    id: "translate-en",
    label: "翻译为英文",
    prompt: "请将下面的文本翻译为地道的英文，仅返回译文：",
  },
  {
    id: "translate-zh",
    label: "翻译为中文",
    prompt: "请将下面的文本翻译为简洁通顺的中文，仅返回译文：",
  },
  {
    id: "to-sql-in",
    label: "转 SQL IN 列表",
    prompt:
      "请将下面的内容整理成一个 SQL IN(...) 列表（字符串值用单引号包围、用逗号分隔，不要返回多余说明）：",
  },
  {
    id: "summarize",
    label: "总结要点",
    prompt: "请用 3-5 个要点总结下面的内容：",
  },
];

const props = defineProps<{
  visible: boolean;
  source: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "replace", text: string): void;
  (e: "insert", text: string): void;
  (e: "send-to-panel", userMessage: string, assistantMessage: string): void;
}>();

const cfg = useAIConfigStore();
const chatApi = useAIChat();

const selectedPreset = ref<string>(PRESETS[0]?.id ?? "");
const customPrompt = ref<string>("");
const previewText = ref<string>("");
const errorMsg = ref<string>("");
const status = ref<"idle" | "streaming" | "done" | "error">("idle");

const previewRef = ref<HTMLDivElement | null>(null);
const customRef = ref<HTMLTextAreaElement | null>(null);

let currentHandle: InlineHandle | null = null;

const activePromptText = computed<string>(() => {
  if (selectedPreset.value === "custom") return customPrompt.value.trim();
  const p = PRESETS.find((x) => x.id === selectedPreset.value);
  return p?.prompt ?? "";
});

const finalUserMessage = computed<string>(() => {
  const head = activePromptText.value;
  const body = props.source;
  if (!head) return body;
  return head + "\n\n" + body;
});

const canRun = computed<boolean>(() => {
  if (!cfg.isConfigured) return false;
  if (selectedPreset.value === "custom") return customPrompt.value.trim().length > 0;
  return true;
});

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      stop();
      return;
    }
    if (!cfg.loaded) await cfg.load();
    previewText.value = "";
    errorMsg.value = "";
    status.value = "idle";
    selectedPreset.value = PRESETS[0]?.id ?? "";
    customPrompt.value = "";
    await nextTick();
  },
);

async function run() {
  if (!canRun.value) {
    errorMsg.value = cfg.isConfigured
      ? "请输入自定义指令"
      : "请先在 设置 → AI 设置 中完成配置";
    return;
  }
  if (status.value === "streaming") return;

  previewText.value = "";
  errorMsg.value = "";
  status.value = "streaming";

  const result = await chatApi.sendInline({
    prompt: finalUserMessage.value,
    onDelta(delta) {
      previewText.value += delta;
      nextTick(() => {
        const el = previewRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    onDone(content) {
      previewText.value = content;
      status.value = "done";
      currentHandle = null;
    },
    onError(err, partial) {
      previewText.value = partial || previewText.value;
      errorMsg.value = err;
      status.value = "error";
      currentHandle = null;
    },
  });

  if ("error" in result) {
    errorMsg.value = result.error;
    status.value = "error";
    return;
  }
  currentHandle = result;
}

async function stop() {
  if (currentHandle) {
    await currentHandle.cancel();
  }
}

function onReplace() {
  if (!previewText.value) return;
  emit("replace", previewText.value);
}

function onInsert() {
  if (!previewText.value) return;
  emit("insert", previewText.value);
}

function onSendToPanel() {
  if (!previewText.value) return;
  emit("send-to-panel", finalUserMessage.value, previewText.value);
}

function close() {
  stop();
  emit("close");
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1250]">
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
        width: 'min(720px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="AI 询问选区"
    >
      <div class="text-[15px] mb-2" :style="{ color: 'var(--text)' }">
        AI 询问选区
      </div>

      <div class="flex flex-wrap gap-1 mb-3">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          class="h-7 px-3 text-[13px] cursor-pointer rounded-sm border"
          :style="
            selectedPreset === p.id
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
          @click="selectedPreset = p.id"
        >
          {{ p.label }}
        </button>
        <button
          class="h-7 px-3 text-[13px] cursor-pointer rounded-sm border"
          :style="
            selectedPreset === 'custom'
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
          @click="selectedPreset = 'custom'; nextTick(() => customRef?.focus())"
        >
          自定义
        </button>
      </div>

      <textarea
        v-if="selectedPreset === 'custom'"
        ref="customRef"
        v-model="customPrompt"
        class="tm-input"
        spellcheck="false"
        :style="{ minHeight: '70px' }"
        placeholder="输入自定义指令，例如：将下面的文本翻译为日语..."
      ></textarea>

      <div
        v-else
        class="text-xs mb-2 px-2 py-1.5 rounded-sm"
        :style="{
          background: 'var(--panel-input)',
          border: '1px solid var(--hairline)',
          color: 'var(--muted)',
        }"
      >
        {{ activePromptText }}
      </div>

      <div class="text-xs mb-1" :style="{ color: 'var(--muted)' }">
        选区文本（{{ source.length }} 字符）
      </div>
      <div
        class="text-[12px] font-mono mb-2 px-2 py-1.5 rounded-sm overflow-auto"
        :style="{
          background: 'var(--panel-input)',
          border: '1px solid var(--hairline)',
          color: 'var(--text)',
          maxHeight: '90px',
          whiteSpace: 'pre-wrap',
        }"
      >
        {{ source }}
      </div>

      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs" :style="{ color: 'var(--muted)' }">预览</span>
        <span class="text-xs" :style="{ color: 'var(--muted)' }">
          {{
            status === "streaming"
              ? "流式生成中..."
              : status === "done"
                ? "已完成"
                : status === "error"
                  ? "出错"
                  : ""
          }}
        </span>
      </div>
      <div
        ref="previewRef"
        class="preview overflow-auto px-2.5 py-2 rounded-sm text-[13px] whitespace-pre-wrap break-words"
        :style="{
          background: 'var(--panel-input)',
          border: '1px solid var(--hairline)',
          color: 'var(--text)',
          minHeight: '160px',
          maxHeight: '300px',
        }"
      >
        {{ previewText || (status === "streaming" ? "▍" : "") }}
      </div>

      <div
        class="min-h-[18px] text-xs mt-2"
        :style="{ color: '#f08f8f' }"
      >
        {{ errorMsg }}
      </div>

      <div class="flex justify-between items-center mt-2 gap-2">
        <span class="text-[11px]" :style="{ color: 'var(--muted)' }">
          {{ cfg.config.defaultModel || "未配置模型" }}
        </span>
        <span class="flex gap-2">
          <button
            v-if="status === 'streaming'"
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            @click="stop"
          >
            停止
          </button>
          <button
            v-else
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--accent); color: var(--text)"
            :disabled="!canRun"
            @click="run"
          >
            {{ previewText ? "重新生成" : "生成" }}
          </button>
          <button
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            :disabled="!previewText || status === 'streaming'"
            @click="onReplace"
          >
            替换选区
          </button>
          <button
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            :disabled="!previewText || status === 'streaming'"
            @click="onInsert"
          >
            插入到光标
          </button>
          <button
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            :disabled="!previewText || status === 'streaming'"
            @click="onSendToPanel"
          >
            送入面板
          </button>
          <button
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            @click="close"
          >
            关闭
          </button>
        </span>
      </div>
    </div>
  </div>
</template>
