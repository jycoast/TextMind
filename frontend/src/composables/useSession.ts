import { watch } from "vue";
import { backend } from "@/api/backend";
import { useTabsStore } from "@/stores/tabs";
import { useRecentStore } from "@/stores/recent";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  normalizeLanguage,
  normalizeRecentFile,
  normalizeViewState,
} from "@/utils/normalize";

export async function saveSession(): Promise<void> {
  const tabsStore = useTabsStore();
  const recentStore = useRecentStore();
  const workspaceStore = useWorkspaceStore();

  tabsStore.persistCurrentText();
  tabsStore.persistCurrentViewState();

  await backend.saveSession({
    nextTabSeq: tabsStore.nextTabSeq,
    selectedIndex: tabsStore.selectedIndex,
    tabs: tabsStore.tabs.map((t) => ({
      title: t.title,
      text: t.text,
      language: normalizeLanguage(t.language),
      path: t.path || "",
      dirty: Boolean(t.dirty),
      ...(t.viewState
        ? { viewState: normalizeViewState(t.viewState) }
        : {}),
    })) as unknown as Parameters<typeof backend.saveSession>[0]["tabs"],
    recentFiles: recentStore.files.map((x) => ({
      path: x.path,
      name: x.name,
      language: normalizeLanguage(x.language),
    })) as unknown as Parameters<typeof backend.saveSession>[0]["recentFiles"],
    workspaceRoot: workspaceStore.root || "",
  });
}

export async function loadSessionIntoStores(): Promise<void> {
  const tabsStore = useTabsStore();
  const recentStore = useRecentStore();
  const workspaceStore = useWorkspaceStore();

  const s = await backend.loadSession();
  const workspaceRoot = String(s?.workspaceRoot || "").trim();
  workspaceStore.clear();
  workspaceStore.root = workspaceRoot;

  if (s && Array.isArray(s.tabs) && s.tabs.length > 0) {
    tabsStore.restoreFromSession({
      nextTabSeq: s.nextTabSeq,
      selectedIndex: s.selectedIndex,
      tabs: s.tabs as unknown as Parameters<
        typeof tabsStore.restoreFromSession
      >[0]["tabs"],
    });
    const recents = Array.isArray(s.recentFiles)
      ? s.recentFiles
          .map((x) => normalizeRecentFile(x))
          .filter(
            (v): v is ReturnType<typeof normalizeRecentFile> & object =>
              v !== null,
          )
          .slice(0, recentStore.RECENT_FILES_MAX)
      : [];
    recentStore.replaceAll(recents);
    return;
  }
  tabsStore.restoreFromSession({ tabs: [] });
  recentStore.replaceAll([]);
}

let saveTimer: number | null = null;

export function scheduleSessionSave(delay = 800): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveSession();
  }, delay);
}

export function installSessionAutoSave(): void {
  const tabsStore = useTabsStore();
  const recentStore = useRecentStore();
  const workspaceStore = useWorkspaceStore();

  watch(
    () => [
      tabsStore.tabs,
      tabsStore.selectedIndex,
      tabsStore.nextTabSeq,
      recentStore.files,
      workspaceStore.root,
    ],
    () => scheduleSessionSave(800),
    { deep: true },
  );

  window.addEventListener("beforeunload", () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    void saveSession();
  });
}
