<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { pluginManager, settingsRegistry } from "@/plugins/core";

const props = defineProps<{
  visible: boolean;
  /**
   * When set, the modal selects the first registered settings page that
   * belongs to this plugin id. Useful when the user enters from the
   * plugin manager's per-row "设置" button.
   */
  initialPluginId?: string;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const pagesRef = settingsRegistry.list();

interface DisplayPage {
  id: string;
  title: string;
  pluginId: string;
  pluginName: string;
  component: ReturnType<typeof computed>["value"];
}

const pages = computed<DisplayPage[]>(() => {
  const manifests = new Map(pluginManager.list().map((m) => [m.id, m]));
  return pagesRef.value.map((p) => ({
    id: p.id,
    title: p.title,
    pluginId: p.pluginId,
    pluginName: manifests.get(p.pluginId)?.name || p.pluginId,
    component: p.component as DisplayPage["component"],
  }));
});

const selectedId = ref<string>("");

watch(
  pages,
  (list) => {
    if (!list.length) {
      selectedId.value = "";
      return;
    }
    if (!list.find((p) => p.id === selectedId.value)) {
      // Prefer the requested plugin's page when opening from the plugin
      // manager. Falls back to the first available page.
      const preferred = props.initialPluginId
        ? list.find((p) => p.pluginId === props.initialPluginId)
        : null;
      selectedId.value = (preferred || list[0]).id;
    }
  },
  { immediate: true },
);

// Re-pick the selection if the caller swaps initialPluginId while the
// modal is open (e.g. user closed it and reopened from a different row
// without unmounting).
watch(
  () => props.initialPluginId,
  (id) => {
    if (!id) return;
    const hit = pages.value.find((p) => p.pluginId === id);
    if (hit) selectedId.value = hit.id;
  },
);

const selected = computed(
  () => pages.value.find((p) => p.id === selectedId.value) || null,
);
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[1300]">
    <div
      class="absolute inset-0"
      :style="{ background: 'var(--overlay)' }"
      @click="emit('close')"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden p-0 box-border rounded-md border flex flex-col"
      :style="{
        background: 'var(--panel-elevated)',
        borderColor: 'var(--hairline)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
        width: 'min(900px, calc(100% - 32px))',
        height: 'min(620px, calc(100% - 48px))',
      }"
      role="dialog"
      aria-label="插件设置"
    >
      <div
        class="flex items-center justify-between px-4 py-2.5 border-b"
        :style="{ borderColor: 'var(--hairline)' }"
      >
        <div class="text-[15px]" :style="{ color: 'var(--text)' }">
          插件设置
        </div>
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

      <div v-if="pages.length === 0" class="flex-1 flex items-center justify-center px-6">
        <div class="text-center text-[12px]" :style="{ color: 'var(--muted)' }">
          暂无可配置的插件。<br />
          插件可以通过 <code class="px-1" :style="{ background: 'var(--panel)' }">ctx.settings.registerPage(...)</code>
          注册自己的配置面板。
        </div>
      </div>

      <div v-else class="flex-1 flex min-h-0">
        <aside
          class="w-[220px] flex-shrink-0 overflow-y-auto border-r"
          :style="{
            background: 'var(--panel)',
            borderColor: 'var(--hairline)',
          }"
        >
          <ul class="py-1.5 list-none m-0 p-0">
            <li
              v-for="p in pages"
              :key="p.id"
              class="px-3 py-2 cursor-pointer"
              :style="{
                background:
                  selectedId === p.id ? 'var(--active-row-bg)' : 'transparent',
                borderLeft:
                  selectedId === p.id
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
              }"
              @click="selectedId = p.id"
            >
              <div class="text-[13px]" :style="{ color: 'var(--text)' }">
                {{ p.title }}
              </div>
              <div class="text-[11px]" :style="{ color: 'var(--muted)' }">
                {{ p.pluginName }}
              </div>
            </li>
          </ul>
        </aside>

        <section class="flex-1 overflow-y-auto p-5 min-w-0">
          <div v-if="selected" class="h-full">
            <div
              class="text-[14px] font-semibold mb-1"
              :style="{ color: 'var(--text)' }"
            >
              {{ selected.title }}
            </div>
            <div
              class="text-[11px] mb-4"
              :style="{ color: 'var(--muted)' }"
            >
              {{ selected.pluginName }} · {{ selected.pluginId }}
            </div>
            <component :is="selected.component" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
