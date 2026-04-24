<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTabsStore } from "@/stores/tabs";
import { useExplorerStore } from "@/stores/explorer";
import FileTreeNode from "./FileTreeNode.vue";

const emit = defineEmits<{
  (e: "open-file", path: string): void;
}>();

const workspace = useWorkspaceStore();
const tabs = useTabsStore();
const explorer = useExplorerStore();
const { tree, root } = storeToRefs(workspace);
const { collapsed, width } = storeToRefs(explorer);
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
  emit("open-file", path);
}
</script>

<template>
  <aside
    class="file-explorer flex flex-col transition-[width] duration-150 ease-out"
    :class="{ collapsed }"
    :style="{
      width: collapsed ? '0px' : `${width}px`,
      minWidth: collapsed ? '0' : '180px',
      maxWidth: '520px',
      background: 'var(--sidebar-bg)',
      borderRight: collapsed ? 'none' : '1px solid var(--hairline)',
    }"
  >
    <div
      v-show="!collapsed"
      class="file-tree flex-1 min-h-0 overflow-auto py-1.5"
    >
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
        class="py-2 px-2.5 text-xs"
        :style="{ color: 'var(--muted)' }"
      >
        请在“文件”菜单中打开文件夹
      </div>
    </div>
  </aside>
</template>
