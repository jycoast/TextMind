import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type { EditorAdapter, MonacoViewState, Tab } from "@/types";
import { backend } from "@/api/backend";
import {
  guessLanguage,
  guessLanguageByFilename,
} from "@/composables/useLanguageGuess";
import { detectLanguageFromContent } from "@/composables/useLanguageDetect";
import {
  normalizeLanguage,
  normalizePathKey,
  normalizeViewState,
} from "@/utils/normalize";
import { useRecentStore } from "@/stores/recent";

function newTabObject(
  title?: string,
  text?: string,
  language: string = "plaintext",
): Tab {
  return {
    id: `${Date.now()}-${Math.random()}`,
    title: title || "未命名",
    text: text || "",
    language: normalizeLanguage(language),
    path: "",
    viewState: null,
    dirty: false,
  };
}

export interface OpenFileResultLike {
  name?: string;
  path?: string;
  text?: string;
  error?: string;
}

export interface OpenResultStatus {
  opened: boolean;
  existed: boolean;
  reloaded?: boolean;
}

export const useTabsStore = defineStore("tabs", () => {
  const tabs = ref<Tab[]>([newTabObject()]);
  const selectedIndex = ref<number>(0);
  const nextTabSeq = ref<number>(0);
  const columnMode = ref<boolean>(false);
  const adapter = shallowRef<EditorAdapter | null>(null);
  const programmaticUpdate = ref<boolean>(false);

  const current = computed<Tab | null>(
    () => tabs.value[selectedIndex.value] || null,
  );

  function setAdapter(a: EditorAdapter | null): void {
    adapter.value = a;
  }

  function findIndexByPath(path: string): number {
    const key = normalizePathKey(path);
    if (!key) return -1;
    return tabs.value.findIndex((t) => normalizePathKey(t.path) === key);
  }

  function persistCurrentText(): void {
    const tab = current.value;
    if (!tab || !adapter.value) return;
    tab.text = adapter.value.getValue();
  }

  function persistCurrentViewState(): void {
    const tab = current.value;
    if (!tab || !adapter.value?.getViewState) return;
    tab.viewState = normalizeViewState(adapter.value.getViewState());
  }

  function renderCurrentIntoEditor(): void {
    const tab = current.value;
    if (!tab || !adapter.value) return;
    programmaticUpdate.value = true;
    try {
      adapter.value.setValue(tab.text || "");
      adapter.value.setLanguage(normalizeLanguage(tab.language));
      adapter.value.setViewState(normalizeViewState(tab.viewState));
    } finally {
      programmaticUpdate.value = false;
    }
    if (columnMode.value && adapter.value.supportsColumnMode) {
      adapter.value.setColumnMode(true);
    }
    adapter.value.focus();
  }

  function pullLatestFromEditor(): { changed: boolean; tab: Tab | null } {
    const tab = current.value;
    if (!tab || !adapter.value) return { changed: false, tab: null };
    const latest = adapter.value.getValue();
    const changed = tab.text !== latest;
    tab.text = latest;
    return { changed, tab };
  }

  function selectTab(i: number): void {
    if (i < 0 || i >= tabs.value.length) return;
    persistCurrentText();
    persistCurrentViewState();
    selectedIndex.value = i;
    renderCurrentIntoEditor();
  }

  function ensureTabsAndRender(nextTabs: Tab[], nextSelected: number): void {
    if (!Array.isArray(nextTabs) || nextTabs.length === 0) {
      tabs.value = [newTabObject()];
      selectedIndex.value = 0;
      renderCurrentIntoEditor();
      return;
    }
    tabs.value = nextTabs;
    selectedIndex.value = Math.max(
      0,
      Math.min(nextSelected, nextTabs.length - 1),
    );
    renderCurrentIntoEditor();
  }

  function closeTab(i: number): void {
    if (i < 0 || i >= tabs.value.length || tabs.value.length <= 1) return;
    persistCurrentText();
    persistCurrentViewState();
    const next = tabs.value.slice();
    next.splice(i, 1);
    let nextSelected = selectedIndex.value;
    if (nextSelected > i) {
      nextSelected -= 1;
    } else if (nextSelected === i) {
      nextSelected = Math.min(i, next.length - 1);
    }
    ensureTabsAndRender(next, nextSelected);
  }

  function closeRight(i: number): void {
    if (i < 0 || i >= tabs.value.length - 1) return;
    persistCurrentText();
    persistCurrentViewState();
    const next = tabs.value.slice(0, i + 1);
    const nextSelected = selectedIndex.value > i ? i : selectedIndex.value;
    ensureTabsAndRender(next, nextSelected);
  }

  function closeLeft(i: number): void {
    if (i <= 0 || i >= tabs.value.length) return;
    persistCurrentText();
    persistCurrentViewState();
    const next = tabs.value.slice(i);
    const nextSelected = Math.max(0, selectedIndex.value - i);
    ensureTabsAndRender(next, nextSelected);
  }

  function closeOthers(i: number): void {
    if (i < 0 || i >= tabs.value.length) return;
    persistCurrentText();
    persistCurrentViewState();
    ensureTabsAndRender([tabs.value[i]], 0);
  }

  function addNewTab(): void {
    persistCurrentText();
    const tab = newTabObject();
    nextTabSeq.value += 1;
    tabs.value.push(tab);
    selectedIndex.value = tabs.value.length - 1;
    renderCurrentIntoEditor();
  }

  function addTabFromText(title: string, text: string, language: string): void {
    persistCurrentText();
    persistCurrentViewState();
    const tab = newTabObject(title, text, language);
    nextTabSeq.value += 1;
    tabs.value.push(tab);
    selectedIndex.value = tabs.value.length - 1;
    renderCurrentIntoEditor();
  }

  function setColumnMode(enabled: boolean): { ok: boolean; applied: boolean } {
    const on = Boolean(enabled);
    if (!adapter.value?.supportsColumnMode) {
      columnMode.value = false;
      return { ok: false, applied: false };
    }
    const ok = adapter.value.setColumnMode(on);
    columnMode.value = Boolean(ok && on);
    return { ok, applied: on };
  }

  function toggleColumnMode(): { ok: boolean; applied: boolean } {
    return setColumnMode(!columnMode.value);
  }

  function replaceSelection(newText: string): boolean {
    if (!adapter.value) return false;
    const ok = adapter.value.replaceSelection(newText);
    if (ok) persistCurrentText();
    return ok;
  }

  function getSelectionText(): string {
    if (!adapter.value) return "";
    return adapter.value.getSelectionText();
  }

  function openFileResultToTab(
    res: OpenFileResultLike,
    confirmReload?: (fileName: string) => boolean,
  ): OpenResultStatus {
    const existingIndex = findIndexByPath(res.path || "");
    if (existingIndex >= 0) {
      const tab = tabs.value[existingIndex];
      if (tab?.dirty) {
        const fileName = res.name || tab.title || "该文件";
        const shouldReload = (confirmReload ?? ((n: string) =>
          window.confirm(
            `${n} 有未保存修改。\n是否用磁盘内容重新加载并覆盖当前修改？`,
          )))(fileName);
        if (shouldReload) {
          persistCurrentText();
          persistCurrentViewState();
          tab.title = res.name || tab.title;
          tab.text = res.text || "";
          tab.language = guessLanguage(res.name || res.path, res.text || "");
          tab.path = res.path || tab.path;
          tab.viewState = null;
          tab.dirty = false;
          selectedIndex.value = existingIndex;
          renderCurrentIntoEditor();
          return { opened: true, existed: true, reloaded: true };
        }
      }
      selectTab(existingIndex);
      return { opened: false, existed: true, reloaded: false };
    }

    const lang = guessLanguage(res.name || res.path, res.text || "");
    const first = tabs.value[0];
    const hasSingleBlankTab =
      tabs.value.length === 1 &&
      !!first &&
      !first.path &&
      !first.dirty &&
      !String(first.text || "").trim() &&
      String(first.title || "").startsWith("未命名");

    if (hasSingleBlankTab && first) {
      first.title = res.name || first.title;
      first.text = res.text || "";
      first.language = lang;
      first.path = res.path || "";
      first.viewState = null;
      first.dirty = false;
      selectedIndex.value = 0;
      renderCurrentIntoEditor();
      return { opened: true, existed: false };
    }

    persistCurrentText();
    persistCurrentViewState();
    const tab = newTabObject(res.name || "未命名", res.text || "", lang);
    tab.path = res.path || "";
    nextTabSeq.value += 1;
    tabs.value.push(tab);
    selectedIndex.value = tabs.value.length - 1;
    renderCurrentIntoEditor();
    return { opened: true, existed: false };
  }

  async function saveCurrent(): Promise<{
    ok: boolean;
    name?: string;
    error?: string;
  }> {
    persistCurrentText();
    const tab = current.value;
    if (!tab) return { ok: false };
    if (tab.path) {
      const res = await backend.saveTextFile(tab.path, tab.text || "");
      if (!res) return { ok: false };
      if (res.error) return { ok: false, error: res.error };
      tab.dirty = false;
      return { ok: true, name: res.name || tab.title };
    }
    const defaultName =
      tab.title && !tab.title.startsWith("未命名")
        ? tab.title
        : "untitled.txt";
    const res = await backend.saveTextFileAs(defaultName, tab.text || "");
    if (!res) return { ok: false };
    if (res.error) return { ok: false, error: res.error };
    if (!res.path) return { ok: false };
    tab.path = res.path;
    if (res.name) tab.title = res.name;
    tab.language = guessLanguage(res.name || res.path, tab.text || "");
    tab.dirty = false;
    renderCurrentIntoEditor();

    useRecentStore().push(
      tab.path,
      tab.title,
      guessLanguageByFilename(tab.title || tab.path),
    );
    return { ok: true, name: res.name || "文件" };
  }

  function restoreFromSession(payload: {
    nextTabSeq?: number;
    selectedIndex?: number;
    tabs?: Array<{
      title?: string;
      text?: string;
      language?: string;
      path?: string;
      dirty?: boolean;
      viewState?: MonacoViewState | null;
    }>;
  }): void {
    const list = payload.tabs ?? [];
    if (list.length > 0) {
      nextTabSeq.value = payload.nextTabSeq || list.length;
      tabs.value = list.map((t, i) => ({
        id: `restored-${i}`,
        title: t.title || "未命名",
        text: t.text || "",
        language: normalizeLanguage(t.language),
        path: t.path || "",
        viewState: normalizeViewState(t.viewState),
        dirty: Boolean(t.dirty),
      }));
      selectedIndex.value = Math.max(
        0,
        Math.min(payload.selectedIndex || 0, tabs.value.length - 1),
      );
      return;
    }
    tabs.value = [newTabObject()];
    selectedIndex.value = 0;
    nextTabSeq.value = 0;
  }

  function markDirty(): void {
    const tab = current.value;
    if (!tab) return;
    if (!tab.dirty) {
      tab.dirty = true;
    }
  }

  function detectAndApplyCurrentLanguage(): {
    ok: boolean;
    language: string;
  } {
    const tab = current.value;
    if (!tab || !adapter.value) return { ok: false, language: "" };
    const text = adapter.value.getValue();
    const lang = detectLanguageFromContent(text);
    if (!lang) return { ok: false, language: "" };
    tab.language = normalizeLanguage(lang);
    adapter.value.setLanguage(tab.language);
    return { ok: true, language: tab.language };
  }

  return {
    tabs,
    selectedIndex,
    nextTabSeq,
    columnMode,
    adapter,
    programmaticUpdate,
    current,
    setAdapter,
    findIndexByPath,
    persistCurrentText,
    persistCurrentViewState,
    renderCurrentIntoEditor,
    pullLatestFromEditor,
    selectTab,
    closeTab,
    closeRight,
    closeLeft,
    closeOthers,
    addNewTab,
    addTabFromText,
    setColumnMode,
    toggleColumnMode,
    replaceSelection,
    getSelectionText,
    openFileResultToTab,
    saveCurrent,
    restoreFromSession,
    markDirty,
    detectAndApplyCurrentLanguage,
  };
});
