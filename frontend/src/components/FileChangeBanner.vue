<script setup lang="ts">
import { computed } from "vue";
import {
  usePendingChanges,
  reloadFile,
  dismissChange,
} from "@/composables/useFileWatcher";
import { pathBaseName } from "@/utils/normalize";

const pendingPaths = usePendingChanges();

const entries = computed(() =>
  Array.from(pendingPaths.value).map((p) => ({
    path: p,
    name: pathBaseName(p) || p,
  })),
);
</script>

<template>
  <div v-for="entry in entries" :key="entry.path" class="file-change-banner">
    <span class="file-change-text">
      文件 <strong>{{ entry.name }}</strong> 已被外部修改
    </span>
    <button class="file-change-btn reload" @click="reloadFile(entry.path)">
      重新加载
    </button>
    <button class="file-change-btn dismiss" @click="dismissChange(entry.path)">
      忽略
    </button>
  </div>
</template>

<style scoped>
.file-change-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: var(--active-row-bg);
  border-bottom: 1px solid var(--hairline);
  font-size: 13px;
  color: var(--text);
  flex-shrink: 0;
}

.file-change-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-change-btn {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 3px;
  border: 1px solid var(--hairline);
  cursor: pointer;
  background: transparent;
  color: var(--text);
}

.file-change-btn.reload {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.file-change-btn:hover {
  opacity: 0.85;
}
</style>
