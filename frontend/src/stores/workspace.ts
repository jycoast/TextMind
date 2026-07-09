import { defineStore } from "pinia";
import { reactive, ref } from "vue";
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
  return reactive<FolderNode>({
    name: String(entry?.name || "").trim() || pathBaseName(path) || path,
    path,
    isDir,
    expanded: false,
    loaded: !isDir,
    loading: false,
    children: [],
    error: "",
  });
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
    if (node.loaded) return true;

    node.loading = true;
    node.error = "";

    // Safety timeout: if the request hangs forever, reset loading after 10s
    const timeout = setTimeout(() => {
      if (node.loading && !node.loaded) {
        node.loading = false;
        node.error = "加载超时，请点击重试";
      }
    }, 10000);

    try {
      const res = await backend.listFolder(node.path);
      clearTimeout(timeout);
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
    } catch {
      clearTimeout(timeout);
      node.error = "读取目录失败";
      node.loaded = false;
      return false;
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
    const rootNode = reactive<FolderNode>({
      name: pathBaseName(p) || p,
      path: p,
      isDir: true,
      expanded: true,
      loaded: false,
      loading: false,
      children: [],
      error: "",
    });
    tree.value = rootNode;

    // Retry up to 3 times with delay if backend isn't ready yet
    for (let attempt = 0; attempt < 3; attempt++) {
      const ok = await ensureChildren(rootNode);
      if (ok) return true;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return Boolean(rootNode.loaded);
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
