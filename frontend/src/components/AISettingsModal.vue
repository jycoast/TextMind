<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAIConfigStore } from "@/stores/aiConfig";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
}>();

const cfgStore = useAIConfigStore();

const baseUrl = ref("");
const apiKey = ref("");
const apiKeyVisible = ref(false);
const defaultModel = ref("");
const newModel = ref("");
const models = ref<string[]>([]);
const systemPrompt = ref("");

const status = ref<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
const testing = ref(false);
const saving = ref(false);
const fetching = ref(false);

const baseUrlRef = ref<HTMLInputElement | null>(null);

const pickerVisible = ref(false);
const pickerFilter = ref("");
const pickerModels = ref<string[]>([]);
const pickerChecked = ref<Record<string, boolean>>({});

const filteredPickerModels = computed<string[]>(() => {
  const q = pickerFilter.value.trim().toLowerCase();
  if (!q) return pickerModels.value;
  return pickerModels.value.filter((m) => m.toLowerCase().includes(q));
});

const pickerCheckedCount = computed<number>(
  () => Object.values(pickerChecked.value).filter(Boolean).length,
);

const allModels = computed<string[]>(() => {
  const set = new Set<string>();
  for (const m of models.value) {
    const t = m.trim();
    if (t) set.add(t);
  }
  if (defaultModel.value.trim()) {
    set.add(defaultModel.value.trim());
  }
  return Array.from(set);
});

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    status.value = null;
    if (!cfgStore.loaded) {
      await cfgStore.load();
    }
    baseUrl.value = cfgStore.config.baseUrl ?? "";
    apiKey.value = cfgStore.config.apiKey ?? "";
    defaultModel.value = cfgStore.config.defaultModel ?? "";
    models.value = Array.isArray(cfgStore.config.models)
      ? [...cfgStore.config.models]
      : [];
    systemPrompt.value = cfgStore.config.systemPrompt ?? "";
    apiKeyVisible.value = false;
    newModel.value = "";
    await nextTick();
    baseUrlRef.value?.focus();
  },
  { immediate: false },
);

function buildConfig() {
  return {
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value,
    defaultModel: defaultModel.value.trim(),
    models: allModels.value,
    systemPrompt: systemPrompt.value,
  };
}

function addModel() {
  const t = newModel.value.trim();
  if (!t) return;
  if (!models.value.includes(t)) {
    models.value = [...models.value, t];
  }
  if (!defaultModel.value.trim()) {
    defaultModel.value = t;
  }
  newModel.value = "";
}

function removeModel(name: string) {
  models.value = models.value.filter((m) => m !== name);
  if (defaultModel.value === name) {
    defaultModel.value = models.value[0] ?? "";
  }
}

function pickAsDefault(name: string) {
  defaultModel.value = name;
}

async function onTest() {
  status.value = { kind: "info", text: "测试中..." };
  testing.value = true;
  try {
    const cfg = buildConfig();
    if (!cfg.baseUrl) {
      status.value = { kind: "err", text: "请填写 Base URL" };
      return;
    }
    if (!cfg.defaultModel) {
      status.value = { kind: "err", text: "请填写或选择默认模型" };
      return;
    }
    const res = await cfgStore.testConnection(cfg);
    if (res.ok) {
      status.value = { kind: "ok", text: "连接成功" };
    } else {
      status.value = { kind: "err", text: res.error || "连接失败" };
    }
  } finally {
    testing.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    const cfg = buildConfig();
    const res = await cfgStore.save(cfg);
    if (!res.ok) {
      status.value = { kind: "err", text: res.error || "保存失败" };
      return;
    }
    status.value = { kind: "ok", text: "已保存" };
    emit("saved");
    setTimeout(() => emit("close"), 350);
  } finally {
    saving.value = false;
  }
}

async function onFetchModels() {
  status.value = { kind: "info", text: "拉取模型列表中..." };
  fetching.value = true;
  try {
    const cfg = buildConfig();
    if (!cfg.baseUrl) {
      status.value = { kind: "err", text: "请填写 Base URL" };
      return;
    }
    const res = await cfgStore.fetchProviderModels(cfg);
    if (!res.ok) {
      status.value = { kind: "err", text: res.error || "拉取失败" };
      return;
    }
    if (res.models.length === 0) {
      status.value = { kind: "err", text: "服务端未返回任何模型" };
      return;
    }
    pickerModels.value = res.models;
    const checked: Record<string, boolean> = {};
    const localSet = new Set(models.value);
    for (const m of res.models) {
      checked[m] = localSet.has(m);
    }
    pickerChecked.value = checked;
    pickerFilter.value = "";
    pickerVisible.value = true;
    status.value = {
      kind: "ok",
      text: `共 ${res.models.length} 个模型，请勾选要加入的项`,
    };
  } finally {
    fetching.value = false;
  }
}

function pickerSelectAll() {
  const next: Record<string, boolean> = {};
  for (const m of filteredPickerModels.value) {
    next[m] = true;
  }
  for (const m of pickerModels.value) {
    if (!(m in next)) next[m] = pickerChecked.value[m] ?? false;
  }
  pickerChecked.value = next;
}

function pickerSelectNone() {
  const next: Record<string, boolean> = {};
  for (const m of filteredPickerModels.value) {
    next[m] = false;
  }
  for (const m of pickerModels.value) {
    if (!(m in next)) next[m] = pickerChecked.value[m] ?? false;
  }
  pickerChecked.value = next;
}

function pickerInvertVisible() {
  const next: Record<string, boolean> = { ...pickerChecked.value };
  for (const m of filteredPickerModels.value) {
    next[m] = !next[m];
  }
  pickerChecked.value = next;
}

function applyPicker() {
  const selected = pickerModels.value.filter((m) => pickerChecked.value[m]);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const m of models.value) {
    const t = m.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    merged.push(t);
  }
  for (const m of selected) {
    if (seen.has(m)) continue;
    seen.add(m);
    merged.push(m);
  }
  models.value = merged;
  if (!defaultModel.value.trim() && merged.length > 0) {
    defaultModel.value = merged[0];
  }
  pickerVisible.value = false;
  status.value = {
    kind: "ok",
    text: `已加入 ${selected.length} 个模型`,
  };
}

function cancelPicker() {
  pickerVisible.value = false;
}

function close() {
  if (pickerVisible.value) {
    pickerVisible.value = false;
    return;
  }
  emit("close");
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="close"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-auto p-4 box-border rounded-md border"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(720px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="AI 设置"
    >
      <div class="text-[15px] mb-3" :style="{ color: 'var(--text)' }">
        AI 设置
      </div>

      <div class="grid gap-3">
        <label class="block">
          <span class="block text-xs mb-1" :style="{ color: 'var(--muted)' }">
            Base URL（OpenAI 兼容根地址，例：https://api.openai.com/v1）
          </span>
          <input
            ref="baseUrlRef"
            v-model="baseUrl"
            class="w-full h-9 px-2.5 box-border rounded-sm border text-[13px] outline-none font-mono"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--hairline)',
              color: 'var(--text)',
            }"
            placeholder="https://api.deepseek.com/v1"
            spellcheck="false"
          />
        </label>

        <label class="block">
          <span class="block text-xs mb-1" :style="{ color: 'var(--muted)' }">
            API Key
          </span>
          <div class="flex gap-2">
            <input
              v-model="apiKey"
              :type="apiKeyVisible ? 'text' : 'password'"
              class="flex-1 h-9 px-2.5 box-border rounded-sm border text-[13px] outline-none font-mono"
              :style="{
                background: 'var(--panel-input)',
                borderColor: 'var(--hairline)',
                color: 'var(--text)',
              }"
              placeholder="sk-..."
              spellcheck="false"
              autocomplete="off"
            />
            <button
              type="button"
              class="tm-menu-item"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="apiKeyVisible = !apiKeyVisible"
            >
              {{ apiKeyVisible ? "隐藏" : "显示" }}
            </button>
          </div>
        </label>

        <div class="block">
          <span class="block text-xs mb-1" :style="{ color: 'var(--muted)' }">
            默认模型
          </span>
          <input
            v-model="defaultModel"
            class="w-full h-9 px-2.5 box-border rounded-sm border text-[13px] outline-none font-mono"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--hairline)',
              color: 'var(--text)',
            }"
            placeholder="gpt-4o-mini"
            spellcheck="false"
          />
        </div>

        <div class="block">
          <span class="block text-xs mb-1" :style="{ color: 'var(--muted)' }">
            模型列表
          </span>
          <div class="flex gap-2 mb-2">
            <input
              v-model="newModel"
              class="flex-1 h-8 px-2 box-border rounded-sm border text-[13px] outline-none font-mono"
              :style="{
                background: 'var(--panel-input)',
                borderColor: 'var(--hairline)',
                color: 'var(--text)',
              }"
              placeholder="添加模型，例：gpt-4o"
              spellcheck="false"
              @keydown.enter="addModel"
            />
            <button
              type="button"
              class="tm-menu-item"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="addModel"
            >
              添加
            </button>
            <button
              type="button"
              class="tm-menu-item"
              style="width: auto; border: 1px solid var(--hairline)"
              :disabled="fetching"
              :title="'调用 ' + (baseUrl.trim() || '<Base URL>') + '/models 拉取模型清单'"
              @click="onFetchModels"
            >
              {{ fetching ? "拉取中..." : "从 API 拉取" }}
            </button>
          </div>
          <div
            v-if="models.length === 0"
            class="text-xs"
            :style="{ color: 'var(--muted)' }"
          >
            暂无模型；上方"默认模型"也会自动加入列表。
          </div>
          <ul v-else class="flex flex-col gap-1">
            <li
              v-for="m in models"
              :key="m"
              class="flex items-center justify-between gap-2 px-2 py-1 rounded-sm"
              :style="{
                background:
                  m === defaultModel ? 'var(--active-row-bg)' : 'transparent',
                border: '1px solid var(--hairline)',
              }"
            >
              <span class="font-mono text-[13px] truncate" :style="{ color: 'var(--text)' }">
                {{ m }}
                <span
                  v-if="m === defaultModel"
                  class="ml-2 text-xs"
                  :style="{ color: 'var(--accent)' }"
                  >默认</span
                >
              </span>
              <span class="flex gap-1">
                <button
                  v-if="m !== defaultModel"
                  type="button"
                  class="tm-menu-item text-xs"
                  style="width: auto; border: 1px solid var(--hairline)"
                  @click="pickAsDefault(m)"
                >
                  设为默认
                </button>
                <button
                  type="button"
                  class="tm-menu-item text-xs"
                  style="width: auto; border: 1px solid var(--hairline)"
                  @click="removeModel(m)"
                >
                  删除
                </button>
              </span>
            </li>
          </ul>
        </div>

        <label class="block">
          <span class="block text-xs mb-1" :style="{ color: 'var(--muted)' }">
            系统提示词（可选，每次会话开头注入）
          </span>
          <textarea
            v-model="systemPrompt"
            class="tm-input"
            spellcheck="false"
            rows="3"
            :style="{ minHeight: '70px' }"
          ></textarea>
        </label>
      </div>

      <div class="min-h-[20px] mt-3 text-xs"
        :style="{
          color:
            status?.kind === 'err'
              ? '#f08f8f'
              : status?.kind === 'ok'
                ? '#7ad08f'
                : 'var(--muted)',
        }">
        {{ status?.text }}
      </div>

      <div class="flex justify-end gap-2 mt-1">
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="testing"
          @click="onTest"
        >
          {{ testing ? "测试中..." : "测试连接" }}
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          :disabled="saving"
          @click="onSave"
        >
          {{ saving ? "保存中..." : "保存" }}
        </button>
        <button
          class="tm-menu-item"
          style="width: auto; border: 1px solid var(--hairline)"
          @click="close"
        >
          关闭
        </button>
      </div>

      <div
        v-if="pickerVisible"
        class="absolute inset-0 flex items-center justify-center"
        :style="{ background: 'var(--overlay)' }"
        @click.self="cancelPicker"
      >
        <div
          class="flex flex-col rounded-md border p-3 box-border"
          :style="{
            background: 'var(--panel-elevated)',
            borderColor: 'var(--hairline)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            width: 'min(560px, calc(100% - 32px))',
            maxHeight: 'calc(100% - 48px)',
          }"
          role="dialog"
          aria-label="选择要加入的模型"
        >
          <div class="text-[14px] mb-2" :style="{ color: 'var(--text)' }">
            选择要加入的模型
            <span class="ml-2 text-xs" :style="{ color: 'var(--muted)' }">
              已选 {{ pickerCheckedCount }} / {{ pickerModels.length }}
            </span>
          </div>

          <div class="flex gap-2 mb-2">
            <input
              v-model="pickerFilter"
              class="flex-1 h-8 px-2 box-border rounded-sm border text-[13px] outline-none"
              :style="{
                background: 'var(--panel-input)',
                borderColor: 'var(--hairline)',
                color: 'var(--text)',
              }"
              placeholder="过滤..."
              spellcheck="false"
            />
            <button
              type="button"
              class="tm-menu-item text-xs"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="pickerSelectAll"
            >
              全选
            </button>
            <button
              type="button"
              class="tm-menu-item text-xs"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="pickerSelectNone"
            >
              全不选
            </button>
            <button
              type="button"
              class="tm-menu-item text-xs"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="pickerInvertVisible"
            >
              反选
            </button>
          </div>

          <div
            class="flex-1 overflow-auto rounded-sm border"
            :style="{
              borderColor: 'var(--hairline)',
              background: 'var(--panel-input)',
              minHeight: '200px',
              maxHeight: '50vh',
            }"
          >
            <div
              v-if="filteredPickerModels.length === 0"
              class="p-3 text-xs"
              :style="{ color: 'var(--muted)' }"
            >
              没有匹配的模型
            </div>
            <ul v-else class="flex flex-col">
              <li
                v-for="m in filteredPickerModels"
                :key="m"
                class="flex items-center gap-2 px-2 py-1 cursor-pointer"
                :style="{
                  borderBottom: '1px solid var(--hairline)',
                }"
                @click="pickerChecked[m] = !pickerChecked[m]"
              >
                <input
                  type="checkbox"
                  :checked="!!pickerChecked[m]"
                  @click.stop
                  @change="pickerChecked[m] = ($event.target as HTMLInputElement).checked"
                />
                <span
                  class="font-mono text-[13px] truncate"
                  :style="{ color: 'var(--text)' }"
                >
                  {{ m }}
                </span>
              </li>
            </ul>
          </div>

          <div class="flex justify-end gap-2 mt-3">
            <button
              type="button"
              class="tm-menu-item"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="cancelPicker"
            >
              取消
            </button>
            <button
              type="button"
              class="tm-menu-item"
              style="width: auto; border: 1px solid var(--hairline)"
              @click="applyPicker"
            >
              应用（{{ pickerCheckedCount }}）
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
