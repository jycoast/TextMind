import { defineStore } from "pinia";
import { ref } from "vue";
import type { RecentFile } from "@/types";
import { normalizeLanguage, normalizeRecentFile } from "@/utils/normalize";

const RECENT_FILES_MAX = 10;

export const useRecentStore = defineStore("recent", () => {
  const files = ref<RecentFile[]>([]);

  function push(path: string, name: string, language: string): void {
    const item = normalizeRecentFile({
      path,
      name,
      language: normalizeLanguage(language),
    });
    if (!item) return;
    const next = files.value.filter(
      (x) => x.path.toLowerCase() !== item.path.toLowerCase(),
    );
    next.unshift(item);
    files.value = next.slice(0, RECENT_FILES_MAX);
  }

  function remove(path: string): void {
    const p = String(path || "")
      .trim()
      .toLowerCase();
    if (!p) return;
    files.value = files.value.filter(
      (x) => x.path.toLowerCase() !== p,
    );
  }

  function replaceAll(list: RecentFile[]): void {
    files.value = list.slice(0, RECENT_FILES_MAX);
  }

  return {
    files,
    push,
    remove,
    replaceAll,
    RECENT_FILES_MAX,
  };
});
