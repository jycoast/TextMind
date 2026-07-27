import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import type { FolderNode } from "@/types";
import { backend } from "@/api/backend";
import { pathBaseName } from "@/utils/normalize";

const EXPANDED_KEY = "TextMind.expandedFolders";

function loadExpandedPaths(rootPath: string): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY) || "{}") as
      Record<string, unknown>;
    const paths = stored[rootPath];
    return new Set(
      Array.isArray(paths)
        ? paths.filter((path): path is string => typeof path === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function saveExpandedPaths(rootPath: string, paths: Set<string>): void {
  if (!rootPath) return;
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY) || "{}") as
      Record<string, unknown>;
    stored[rootPath] = [...paths];
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(stored));
  } catch {
    // localStorage can be unavailable in tests and restricted webviews.
  }
}

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
  let expandedPaths = new Set<string>();

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
      for (const child of node.children) {
        if (child.isDir) child.expanded = expandedPaths.has(child.path);
      }
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
      expandedPaths = new Set();
      tree.value = null;
      return false;
    }
    expandedPaths = loadExpandedPaths(p);
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
      if (ok) {
        await restoreExpandedChildren(rootNode);
        return true;
      }
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
    if (node.expanded) expandedPaths.add(node.path);
    else expandedPaths.delete(node.path);
    saveExpandedPaths(root.value, expandedPaths);
    if (node.expanded && !node.loaded) {
      await ensureChildren(node);
      await restoreExpandedChildren(node);
    }
  }

  async function restoreExpandedChildren(node: FolderNode): Promise<void> {
    for (const child of node.children) {
      if (!child.isDir || !child.expanded) continue;
      if (await ensureChildren(child)) await restoreExpandedChildren(child);
    }
  }

  function clear(): void {
    root.value = "";
    tree.value = null;
    expandedPaths = new Set();
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
