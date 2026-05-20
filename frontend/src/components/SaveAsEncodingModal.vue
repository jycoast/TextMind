<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { backend } from "@/api/backend";
import type { EncodingMeta } from "@/types";

const props = defineProps<{
  visible: boolean;
  initialEncoding?: string;
  initialHasBOM?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", payload: { encoding: string; withBOM: boolean }): void;
}>();

const options = ref<EncodingMeta[]>([]);
const selected = ref<string>(props.initialEncoding || "utf-8");
const withBOM = ref<boolean>(Boolean(props.initialHasBOM));

const grouped = computed(() => {
  const groups: { name: string; items: EncodingMeta[] }[] = [];
  for (const item of options.value) {
    const g = groups.find((x) => x.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
});

const bomSupported = computed(() => {
  const id = selected.value;
  return id === "utf-8" || id === "utf-8-bom" || id === "utf-16le" ||
    id === "utf-16be";
});

async function loadEncodings() {
  try {
    const list = await backend.listSupportedEncodings();
    options.value = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("[encoding] failed to load encodings", err);
  }
}

onMounted(loadEncodings);

watch(
  () => props.visible,
  (open) => {
    if (open) {
      selected.value = props.initialEncoding || "utf-8";
      withBOM.value = Boolean(props.initialHasBOM);
      if (options.value.length === 0) {
        void loadEncodings();
      }
    }
  },
);

watch(selected, (id) => {
  if (id === "utf-8-bom") withBOM.value = true;
});

function onCancel() {
  emit("close");
}

function onConfirm() {
  // utf-8-bom is normalized to utf-8 + withBOM=true on the backend either way,
  // but keep the explicit id when the user picked it via the list.
  emit("confirm", {
    encoding: selected.value,
    withBOM: bomSupported.value ? withBOM.value : false,
  });
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0 bg-black/40"
      aria-hidden="true"
      @click="onCancel"
    ></div>
    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] rounded-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="选择保存编码"
      :style="{
        background: 'var(--panel)',
        border: '1px solid var(--hairline)',
        color: 'var(--text)',
      }"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="text-[15px]">另存为：选择编码</div>
        <button
          type="button"
          class="h-6 px-2 text-xs rounded-sm cursor-pointer bg-transparent border border-solid"
          :style="{ borderColor: 'var(--hairline)', color: 'var(--muted)' }"
          @click="onCancel"
        >
          取消
        </button>
      </div>

      <div
        class="rounded-sm border overflow-hidden mb-3"
        :style="{ borderColor: 'var(--hairline)' }"
      >
        <div class="max-h-[260px] overflow-y-auto">
          <template v-for="group in grouped" :key="group.name">
            <div
              class="px-3 pt-2 pb-1 text-[11px]"
              :style="{ color: 'var(--muted)' }"
            >
              {{ group.name }}
            </div>
            <label
              v-for="opt in group.items"
              :key="opt.id"
              class="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[13px]"
              :class="{ 'tm-enc-row-active': opt.id === selected }"
            >
              <input
                v-model="selected"
                type="radio"
                :value="opt.id"
                class="cursor-pointer"
              />
              <span class="flex-1 truncate">{{ opt.label }}</span>
              <span
                class="text-[11px] font-mono"
                :style="{ color: 'var(--muted)' }"
              >
                {{ opt.id }}
              </span>
            </label>
          </template>
          <div
            v-if="options.length === 0"
            class="px-3 py-4 text-center text-[12px]"
            :style="{ color: 'var(--muted)' }"
          >
            正在加载编码列表...
          </div>
        </div>
      </div>

      <label
        class="flex items-center gap-2 mb-3 text-[12px] cursor-pointer"
        :class="{ 'opacity-50 cursor-not-allowed': !bomSupported }"
      >
        <input
          v-model="withBOM"
          type="checkbox"
          :disabled="!bomSupported"
        />
        <span>写入 BOM（仅 UTF-8 / UTF-16 支持）</span>
      </label>

      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="h-7 px-3 text-[13px] rounded-sm cursor-pointer bg-transparent border border-solid"
          :style="{ borderColor: 'var(--hairline)', color: 'var(--text)' }"
          @click="onCancel"
        >
          取消
        </button>
        <button
          type="button"
          class="h-7 px-3 text-[13px] rounded-sm cursor-pointer border border-solid"
          :style="{
            borderColor: 'var(--accent)',
            background: 'var(--accent)',
            color: 'var(--accent-fg, #fff)',
          }"
          @click="onConfirm"
        >
          确定并另存为...
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tm-enc-row-active {
  background: var(--active-row-bg);
}
</style>
