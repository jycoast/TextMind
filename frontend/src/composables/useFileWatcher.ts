import { ref } from "vue";
import { backend } from "@/api/backend";
import { useTabsStore } from "@/stores/tabs";

const pendingPaths = ref<Set<string>>(new Set());

let installed = false;

/**
 * Installs the file watcher integration (pull model).
 * Checks for external modifications when the window regains focus,
 * avoiding background goroutines that can crash on Windows.
 */
export function installFileWatcher() {
  if (installed) return;
  installed = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkForChanges();
    }
  });

  window.addEventListener("focus", () => {
    checkForChanges();
  });
}

async function checkForChanges() {
  try {
    const changed = await backend.checkFileChanges();
    if (!changed || changed.length === 0) return;
    const tabs = useTabsStore();
    for (const info of changed) {
      const tab = tabs.tabs.find((t) => t.path === info.path);
      if (!tab) continue;
      if (pendingPaths.value.has(info.path)) continue;
      pendingPaths.value.add(info.path);
    }
  } catch {
    // silently ignore
  }
}

/**
 * Start watching a file path. Call after opening or saving a file.
 */
export function watchFilePath(path: string) {
  if (!path) return;
  backend.watchFile(path);
}

/**
 * Stop watching a file path. Call when a tab is closed.
 */
export function unwatchFilePath(path: string) {
  if (!path) return;
  backend.unwatchFile(path);
  pendingPaths.value.delete(path);
}

/**
 * Refresh the watch baseline (e.g. after a save).
 */
export function refreshFileWatch(path: string) {
  if (!path) return;
  backend.refreshFileWatch(path);
}

/**
 * Get the set of paths with pending external changes.
 */
export function usePendingChanges() {
  return pendingPaths;
}

/**
 * Dismiss the pending change notification for a path.
 */
export function dismissChange(path: string) {
  pendingPaths.value.delete(path);
}

/**
 * Reload a file from disk and dismiss the change notification.
 */
export async function reloadFile(path: string) {
  const tabs = useTabsStore();
  const tab = tabs.tabs.find((t) => t.path === path);
  if (!tab) {
    pendingPaths.value.delete(path);
    return;
  }
  const res = await backend.openTextFileByPath(path);
  if (res && !res.error && res.text != null) {
    tab.text = res.text;
    tab.dirty = false;
    if (res.encoding) tab.encoding = res.encoding;
    if (res.hasBOM != null) tab.hasBOM = res.hasBOM;
    if (tabs.current?.id === tab.id && tabs.adapter) {
      tabs.programmaticUpdate = true;
      tabs.adapter.setValue(res.text);
      tabs.programmaticUpdate = false;
    }
  }
  pendingPaths.value.delete(path);
  refreshFileWatch(path);
}
