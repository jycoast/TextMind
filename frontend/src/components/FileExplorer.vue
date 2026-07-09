<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTabsStore } from "@/stores/tabs";
import { commandRegistry } from "@/plugins/core";
import FileTreeNode from "./FileTreeNode.vue";

const workspace = useWorkspaceStore();
const tabs = useTabsStore();
const { tree, root } = storeToRefs(workspace);
const { tabs: tabList } = storeToRefs(tabs);

const activePaths = computed(() => {
  const s = new Set<string>();
  tabList.value.forEach((t) => {
    if (t.path) s.add(t.path);
  });
  return s;
});

function onToggleDir(path: string) {
  workspace.toggleFolder(path);
}

function onOpenFile(path: string) {
  commandRegistry.execute("file.openByPath", path);
}
</script>

<template>
  <div class="file-explorer-content">
    <template v-if="tree && root">
      <FileTreeNode
        :node="tree"
        :depth="0"
        :active-paths="activePaths"
        @open-file="onOpenFile"
        @toggle-dir="onToggleDir"
      />
    </template>
    <div
      v-else
      class="empty-hint"
    >
      请在"文件"菜单中打开文件夹
    </div>
  </div>
</template>

<style scoped>
.file-explorer-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
}

.empty-hint {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--muted);
}
</style>
