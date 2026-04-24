<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { generateBatchSql } from "@/composables/useTemplateGen";

const props = defineProps<{
  visible: boolean;
  initialData?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "insert", text: string): void;
  (e: "new-tab", text: string): void;
  (e: "error", message: string): void;
}>();

const dataText = ref("");
const tplText = ref("");
const errorMsg = ref("");
const dataRef = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      errorMsg.value = "";
      if (!dataText.value.trim() && props.initialData) {
        dataText.value = props.initialData;
      }
      await nextTick();
      dataRef.value?.focus();
    }
  },
);

function run(mode: "insert" | "new-tab") {
  try {
    errorMsg.value = "";
    const result = generateBatchSql(dataText.value, tplText.value);
    if (mode === "insert") emit("insert", result);
    else emit("new-tab", result);
  } catch (err) {
    errorMsg.value = (err as Error)?.message || "生成失败";
    emit("error", errorMsg.value);
  }
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
      aria-label="模板批量生成"
    >
      <div class="text-[15px] mb-2" :style="{ color: 'var(--text)' }">
        模板批量生成
      </div>
      <div class="text-xs mb-2.5" :style="{ color: 'var(--muted)' }">
        数据使用 TSV（Excel 直接复制），模板占位符如
        <code v-pre>{{ A }}</code>
        <code v-pre>{{ B }}</code
        >，行号占位符
        <code v-pre>{{ ROW }}</code
        >。
      </div>
      <label
        for="templateDataInput"
        class="block text-xs mb-1"
        :style="{ color: 'var(--muted)' }"
        >数据</label
      >
      <textarea
        id="templateDataInput"
        ref="dataRef"
        v-model="dataText"
        class="tm-input"
        spellcheck="false"
      ></textarea>
      <label
        for="templateTplInput"
        class="block text-xs mb-1"
        :style="{ color: 'var(--muted)' }"
        >模板</label
      >
      <textarea
        id="templateTplInput"
        v-model="tplText"
        class="tm-input"
        spellcheck="false"
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
          @click="run('insert')"
        >
          替换选区
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          @click="run('new-tab')"
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
