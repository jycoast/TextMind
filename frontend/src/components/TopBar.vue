<script setup lang="ts">
import { storeToRefs } from "pinia";
import FileMenu from "./menus/FileMenu.vue";
import EditMenu from "./menus/EditMenu.vue";
import SettingsMenu from "./menus/SettingsMenu.vue";
import { useAIPanelStore } from "@/stores/aiPanel";

defineEmits<{
  (e: "save"): void;
  (e: "openFile"): void;
  (e: "openFolder"): void;
  (e: "openRecent", path: string): void;
  (e: "extract"): void;
  (e: "dedupe"): void;
  (e: "singleton"): void;
  (e: "inlist"): void;
  (e: "template-sql"): void;
  (e: "toggle-column"): void;
  (e: "format-json"): void;
  (e: "minify-json"): void;
  (e: "detect-language"): void;
  (e: "ai-inline"): void;
  (e: "open-ai-settings"): void;
  (e: "toggle-ai-panel"): void;
  (e: "check-for-updates"): void;
}>();

const aiPanel = useAIPanelStore();
const { visible: aiPanelVisible } = storeToRefs(aiPanel);
</script>

<template>
  <header class="block bg-bg">
    <div
      class="h-8 flex items-center gap-0.5 px-2"
      :style="{ borderBottom: '1px solid var(--hairline)' }"
    >
      <FileMenu
        @save="$emit('save')"
        @open-file="$emit('openFile')"
        @open-folder="$emit('openFolder')"
        @open-recent="(p) => $emit('openRecent', p)"
      />
      <EditMenu
        @extract="$emit('extract')"
        @dedupe="$emit('dedupe')"
        @singleton="$emit('singleton')"
        @inlist="$emit('inlist')"
        @template-sql="$emit('template-sql')"
        @toggle-column="$emit('toggle-column')"
        @format-json="$emit('format-json')"
        @minify-json="$emit('minify-json')"
        @detect-language="$emit('detect-language')"
        @ai-inline="$emit('ai-inline')"
      />
      <SettingsMenu
        @open-ai-settings="$emit('open-ai-settings')"
        @check-for-updates="$emit('check-for-updates')"
      />
      <span class="ml-auto flex items-center pr-1">
        <button
          class="h-7 px-2.5 text-[13px] cursor-pointer rounded-sm border"
          :style="
            aiPanelVisible
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
          title="切换 AI 面板 (Ctrl+L)"
          @click="$emit('toggle-ai-panel')"
        >
          AI
        </button>
      </span>
    </div>
  </header>
</template>
