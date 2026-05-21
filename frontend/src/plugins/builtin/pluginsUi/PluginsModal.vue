<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { backend } from "@/api/backend";
import { pluginManager } from "@/plugins/core";
import type { main } from "@wails/go/models";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const externalList = ref<main.PluginManifestDTO[]>([]);
const root = ref<string>("");
const loadError = ref<string>("");
const busyId = ref<string>("");

const builtinList = computed(() =>
  pluginManager.list().filter((m) => m.builtin),
);

async function refresh() {
  try {
    const res = await backend.listExternalPlugins();
    externalList.value = (res.plugins as main.PluginManifestDTO[]) || [];
    root.value = res.root || "";
    loadError.value = res.error || "";
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(refresh);

async function toggleEnabled(p: main.PluginManifestDTO) {
  if (busyId.value) return;
  busyId.value = p.id;
  try {
    await backend.setExternalPluginEnabled(p.id, !p.enabled);
    p.enabled = !p.enabled;
  } finally {
    busyId.value = "";
  }
}

async function uninstall(p: main.PluginManifestDTO) {
  if (busyId.value) return;
  if (!window.confirm(`确认卸载插件「${p.name || p.id}」？此操作不可撤销。`)) {
    return;
  }
  busyId.value = p.id;
  try {
    const res = await backend.uninstallExternalPlugin(p.id);
    if (!res.ok && res.error) {
      window.alert(`卸载失败：${res.error}`);
    }
    await refresh();
  } finally {
    busyId.value = "";
  }
}

async function openFolder() {
  await backend.openPluginsDir();
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="emit('close')"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-auto p-4 box-border rounded-md border"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(820px, calc(100% - 32px))',
        maxHeight: 'calc(100% - 48px)',
      }"
      role="dialog"
      aria-label="插件管理"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="text-[15px]" :style="{ color: 'var(--text)' }">
          插件管理
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-7 px-2.5 text-[13px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            @click="openFolder"
          >
            打开插件目录
          </button>
          <button
            type="button"
            class="h-7 px-2.5 text-[13px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            @click="refresh"
          >
            刷新
          </button>
          <button
            type="button"
            class="h-7 px-2.5 text-[13px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            @click="emit('close')"
          >
            关闭
          </button>
        </div>
      </div>

      <div class="text-xs mb-3" :style="{ color: 'var(--muted)' }">
        插件目录：{{ root || "(未确定)" }}
        <span v-if="loadError" :style="{ color: 'var(--error)' }">
          · {{ loadError }}
        </span>
      </div>

      <div class="text-[13px] mb-1" :style="{ color: 'var(--text)' }">
        内置插件
      </div>
      <div
        class="rounded-sm border overflow-hidden mb-4"
        :style="{ borderColor: 'var(--hairline)' }"
      >
        <div
          v-for="(m, i) in builtinList"
          :key="m.id"
          class="flex items-center gap-3 px-3 py-2"
          :style="{
            background:
              i % 2 === 0 ? 'var(--panel)' : 'var(--panel-elevated)',
            borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
          }"
        >
          <div class="flex-1">
            <div class="text-[13px]" :style="{ color: 'var(--text)' }">
              {{ m.name }}
              <span class="ml-2 text-[11px]" :style="{ color: 'var(--muted)' }">
                v{{ m.version }}
              </span>
            </div>
            <div
              v-if="m.description"
              class="text-[12px]"
              :style="{ color: 'var(--muted)' }"
            >
              {{ m.description }}
            </div>
            <div class="text-[11px]" :style="{ color: 'var(--muted)' }">
              {{ m.id }}
            </div>
          </div>
          <span
            class="text-[11px] px-2 py-0.5 rounded-sm"
            :style="{
              background: 'var(--panel)',
              border: '1px solid var(--hairline)',
              color: 'var(--muted)',
            }"
          >
            built-in
          </span>
        </div>
      </div>

      <div class="text-[13px] mb-1" :style="{ color: 'var(--text)' }">
        外置插件
      </div>
      <div
        class="rounded-sm border overflow-hidden"
        :style="{ borderColor: 'var(--hairline)' }"
      >
        <div
          v-if="externalList.length === 0"
          class="px-3 py-4 text-center text-[12px]"
          :style="{ color: 'var(--muted)' }"
        >
          暂无外置插件。把 ESM 入口放到上方目录里，重启应用即可加载。
        </div>
        <div
          v-for="(p, i) in externalList"
          :key="p.id"
          class="flex items-center gap-3 px-3 py-2"
          :style="{
            background:
              i % 2 === 0 ? 'var(--panel)' : 'var(--panel-elevated)',
            borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
          }"
        >
          <div class="flex-1">
            <div class="text-[13px]" :style="{ color: 'var(--text)' }">
              {{ p.name || p.id }}
              <span
                v-if="p.version"
                class="ml-2 text-[11px]"
                :style="{ color: 'var(--muted)' }"
              >
                v{{ p.version }}
              </span>
            </div>
            <div
              v-if="p.description"
              class="text-[12px]"
              :style="{ color: 'var(--muted)' }"
            >
              {{ p.description }}
            </div>
            <div class="text-[11px]" :style="{ color: 'var(--muted)' }">
              {{ p.id }} · {{ p.installPath }}
            </div>
            <div
              v-if="p.permissions && p.permissions.length"
              class="text-[11px] mt-1"
              :style="{ color: 'var(--muted)' }"
            >
              权限：{{ p.permissions.join(", ") }}
            </div>
            <div
              v-if="p.error"
              class="text-[11px] mt-1"
              :style="{ color: 'var(--error)' }"
            >
              {{ p.error }}
            </div>
          </div>
          <button
            type="button"
            class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border"
            :style="{
              background: p.enabled
                ? 'var(--active-row-bg)'
                : 'transparent',
              borderColor: p.enabled ? 'var(--accent)' : 'var(--hairline)',
              color: 'var(--text)',
            }"
            :disabled="busyId === p.id"
            @click="toggleEnabled(p)"
          >
            {{ p.enabled ? "已启用" : "已禁用" }}
          </button>
          <button
            type="button"
            class="h-6 px-2 text-[12px] rounded-sm cursor-pointer border"
            :style="{
              background: 'transparent',
              borderColor: 'var(--hairline)',
              color: 'var(--muted)',
            }"
            :disabled="busyId === p.id"
            @click="uninstall(p)"
          >
            卸载
          </button>
        </div>
      </div>

      <div class="text-[11px] mt-3" :style="{ color: 'var(--muted)' }">
        启用/禁用变更将在下次重启后生效。
      </div>
    </div>
  </div>
</template>
