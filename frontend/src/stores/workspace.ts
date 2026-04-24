import { defineStore } from "pinia";
import { ref } from "vue";
import type { FolderNode } from "@/types";
import { backend } from "@/api/backend";
import { pathBaseName } from "@/utils/normalize";

function createFolderNode(entry: {
  name?: string;
  path?: string;
  isDir?: boolean;
}): FolderNode | null {
  const path = String(entry?.path || "").trim();
  if (!path) return null;
  const isDir = Boolean(entry?.isDir);
  return {
    name: String(entry?.name || "").trim() || pathBaseName(path) || path,
    path,
    isDir,
    expanded: false,
    loaded: !isDir,
    loading: false,
    children: [],
    error: "",
  };
}

function normalizeFolderEntries(entries: unknown): FolderNode[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => createFolderNode(e as { name?: string; path?: string; isDir?: boolean }))
    .filter((n): n is FolderNode => n !== null && Boolean(n.path));
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const root = ref<string>("");
  const tree = ref<FolderNode | null>(null);

  function findNode(
    path: string,
    node: FolderNode | null = tree.value,
  ): FolderNode | null {
    const p = String(path || "").trim();
    if (!p || !node) return null;
    if (node.path === p) return node;
    if (!Array.isArray(node.children) || node.children.length === 0) return null;
    for (const child of node.children) {
      if (!child?.isDir) continue;
      const hit = findNode(p, child);
      if (hit) return hit;
    }
    return null;
  }

  async function ensureChildren(node: FolderNode): Promise<boolean> {
    if (!node?.isDir) return false;
    if (node.loaded || node.loading) return Boolean(node.loaded);
    node.loading = true;
    node.error = "";
    try {
      const res = await backend.listFolder(node.path);
      if (!res) {
        node.error = "读取目录失败";
        node.loaded = false;
        return false;
      }
      if (res.error) {
        node.error = res.error;
        node.loaded = false;
        return false;
      }
      node.children = normalizeFolderEntries(res.entries);
      node.loaded = true;
      node.error = "";
      return true;
    } finally {
      node.loading = false;
    }
  }

  async function setRoot(path: string): Promise<boolean> {
    const p = String(path || "").trim();
    root.value = p;
    if (!p) {
      tree.value = null;
      return false;
    }
    const rootNode = createFolderNode({
      name: pathBaseName(p) || p,
      path: p,
      isDir: true,
    });
    if (!rootNode) return false;
    rootNode.expanded = true;
    rootNode.loaded = false;
    tree.value = rootNode;
    await ensureChildren(rootNode);
    return true;
  }

  async function toggleFolder(path: string): Promise<void> {
    const node = findNode(path);
    if (!node || !node.isDir) return;
    node.expanded = !node.expanded;
    if (node.expanded && !node.loaded) {
      await ensureChildren(node);
    }
  }

  function clear(): void {
    root.value = "";
    tree.value = null;
  }

  return {
    root,
    tree,
    findNode,
    ensureChildren,
    setRoot,
    toggleFolder,
    clear,
  };
});
