<script setup lang="ts">
import { storeToRefs } from "pinia";
import FileMenu from "./menus/FileMenu.vue";
import EditMenu from "./menus/EditMenu.vue";
import SettingsMenu from "./menus/SettingsMenu.vue";
import { useAIPanelStore } from "@/stores/aiPanel";

defineEmits<{
  (e: "save"): void;
  (e: "saveAs"): void;
  (e: "openFile"): void;
  (e: "openFolder"): void;
  (e: "openRecent", path: string): void;
  (e: "template-sql"): void;
  (e: "toggle-column"): void;
  (e: "detect-language"): void;
  (e: "open-ai-settings"): void;
  (e: "open-shortcuts"): void;
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
        @save-as="$emit('saveAs')"
        @open-file="$emit('openFile')"
        @open-folder="$emit('openFolder')"
        @open-recent="(p) => $emit('openRecent', p)"
      />
      <EditMenu
        @template-sql="$emit('template-sql')"
        @toggle-column="$emit('toggle-column')"
        @detect-language="$emit('detect-language')"
      />
      <SettingsMenu
        @open-ai-settings="$emit('open-ai-settings')"
        @open-shortcuts="$emit('open-shortcuts')"
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
