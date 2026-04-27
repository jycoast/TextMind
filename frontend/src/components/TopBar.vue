<script setup lang="ts">
import FileMenu from "./menus/FileMenu.vue";
import EditMenu from "./menus/EditMenu.vue";
import SettingsMenu from "./menus/SettingsMenu.vue";

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
}>();
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
      />
      <SettingsMenu />
    </div>
  </header>
</template>
