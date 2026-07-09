<script setup lang="ts">
import { ref, watch } from "vue";
import { backend } from "@/api/backend";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTabsStore } from "@/stores/tabs";
import { commandRegistry } from "@/plugins/core";

interface SearchMatch {
  path: string;
  relative: string;
  line: number;
  column: number;
  text: string;
}

interface FileGroup {
  relative: string;
  path: string;
  matches: SearchMatch[];
  isTab?: boolean;
}

const workspace = useWorkspaceStore();
const tabs = useTabsStore();

const query = ref("");
const caseSensitive = ref(false);
const searching = ref(false);
const results = ref<FileGroup[]>([]);
const totalMatches = ref(0);
const totalFiles = ref(0);
const truncated = ref(false);
const errorMsg = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const collapsedFiles = ref<Set<string>>(new Set());

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSearch, 300);
});

watch(caseSensitive, () => {
  doSearch();
});

function searchInTabs(q: string): FileGroup[] {
  const isCaseSensitive = caseSensitive.value;
  const searchQ = isCaseSensitive ? q : q.toLowerCase();
  const groups: FileGroup[] = [];

  for (const tab of tabs.tabs) {
    if (!tab.text) continue;
    const lines = tab.text.split("\n");
    const matches: SearchMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const searchLine = isCaseSensitive ? line : line.toLowerCase();
      const col = searchLine.indexOf(searchQ);
      if (col < 0) continue;
      let displayLine = line;
      if (displayLine.length > 300) {
        const start = Math.max(0, col - 50);
        displayLine = displayLine.substring(start, start + 200);
      }
      matches.push({
        path: tab.path || `tab:${tab.id}`,
        relative: tab.path || tab.title,
        line: i + 1,
        column: col + 1,
        text: displayLine,
      });
      if (matches.length >= 50) break;
    }
    if (matches.length > 0) {
      const label = tab.path || tab.title;
      const suffix = tab.dirty ? " (未保存)" : "";
      groups.push({
        relative: label + suffix,
        path: tab.path || `tab:${tab.id}`,
        matches,
        isTab: true,
      });
    }
  }
  return groups;
}

async function doSearch() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    totalMatches.value = 0;
    totalFiles.value = 0;
    truncated.value = false;
    errorMsg.value = "";
    return;
  }

  searching.value = true;
  errorMsg.value = "";

  try {
    // Search in open tabs first (always available, even without workspace)
    const tabResults = searchInTabs(q);

    // Search in workspace files
    let fileResults: FileGroup[] = [];
    let fileTruncated = false;
    let fileTotalFiles = 0;

    if (workspace.root) {
      const res = await backend.searchInFiles({
        query: q,
        root: workspace.root,
        caseSensitive: caseSensitive.value,
        useRegex: false,
        wholeWord: false,
        includePattern: "",
        excludePattern: "",
        maxResults: 500,
      } as any);
      if (res.error) {
        errorMsg.value = res.error;
      } else {
        fileResults = groupByFile(res.matches || []);
        fileTruncated = Boolean(res.truncated);
        fileTotalFiles = res.totalFiles || 0;
      }
    }

    // Merge: tab results first, then file results (skip duplicates)
    const tabPaths = new Set(
      tabResults.map((g) => g.path).filter((p) => !p.startsWith("tab:")),
    );
    const dedupedFileResults = fileResults.filter(
      (g) => !tabPaths.has(g.path),
    );

    const merged = [...tabResults, ...dedupedFileResults];
    results.value = merged;
    totalMatches.value = merged.reduce((sum, g) => sum + g.matches.length, 0);
    totalFiles.value = tabResults.length + fileTotalFiles;
    truncated.value = fileTruncated;
  } catch (err) {
    errorMsg.value = String(err);
  } finally {
    searching.value = false;
  }
}

function groupByFile(matches: SearchMatch[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const m of matches) {
    let group = map.get(m.path);
    if (!group) {
      group = { relative: m.relative, path: m.path, matches: [] };
      map.set(m.path, group);
    }
    group.matches.push(m);
  }
  return Array.from(map.values());
}

function toggleFile(path: string) {
  if (collapsedFiles.value.has(path)) {
    collapsedFiles.value.delete(path);
  } else {
    collapsedFiles.value.add(path);
  }
}

function openMatch(match: SearchMatch) {
  // For unsaved tabs (path starts with "tab:"), switch to the tab directly
  if (match.path.startsWith("tab:")) {
    const tabId = match.path.slice(4);
    const idx = tabs.tabs.findIndex((t) => t.id === tabId);
    if (idx >= 0) {
      tabs.selectTab(idx);
    }
    return;
  }
  commandRegistry.execute("file.openByPath", match.path);
}

function onInputKeydown(ev: KeyboardEvent) {
  if (ev.key === "Enter") {
    ev.preventDefault();
    doSearch();
  }
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="search-panel">
    <div class="search-header">
      <div class="search-input-row">
        <input
          ref="inputRef"
          v-model="query"
          placeholder="搜索文本..."
          class="search-input"
          @keydown="onInputKeydown"
        />
      </div>
      <div class="search-options">
        <label class="search-option">
          <input v-model="caseSensitive" type="checkbox" />
          <span>区分大小写</span>
        </label>
      </div>
    </div>

    <div class="search-status" v-if="searching">正在搜索...</div>
    <div class="search-status" v-else-if="errorMsg">{{ errorMsg }}</div>
    <div
      class="search-status"
      v-else-if="query.trim() && results.length === 0 && !searching"
    >
      没有找到匹配结果
    </div>
    <div class="search-summary" v-else-if="totalMatches > 0">
      {{ totalMatches }} 个结果，{{ totalFiles }} 个文件
      <span v-if="truncated">（已截断）</span>
    </div>

    <div class="search-results">
      <div v-for="group in results" :key="group.path" class="search-file-group">
        <div class="search-file-header" @click="toggleFile(group.path)">
          <span class="search-file-arrow">{{
            collapsedFiles.has(group.path) ? "▸" : "▾"
          }}</span>
          <span v-if="group.isTab" class="search-file-badge">TAB</span>
          <span class="search-file-name" :title="group.path">{{
            group.relative
          }}</span>
          <span class="search-file-count">{{ group.matches.length }}</span>
        </div>
        <div
          v-if="!collapsedFiles.has(group.path)"
          class="search-match-list"
        >
          <div
            v-for="(m, i) in group.matches"
            :key="i"
            class="search-match-item"
            @click="openMatch(m)"
          >
            <span class="search-match-line">{{ m.line }}</span>
            <span class="search-match-text">{{ m.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sidebar-bg);
}

.search-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}

.search-input-row {
  display: flex;
  gap: 6px;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: var(--panel-input);
  color: var(--text);
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-options {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}

.search-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.search-option input[type="checkbox"] {
  margin: 0;
  accent-color: var(--accent);
}

.search-status {
  padding: 12px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.search-summary {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--muted);
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}

.search-results {
  flex: 1;
  overflow-y: auto;
}

.search-file-group {
  border-bottom: 1px solid var(--hairline);
}

.search-file-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.search-file-header:hover {
  background: var(--hover-bg);
}

.search-file-arrow {
  width: 12px;
  font-size: 10px;
  color: var(--muted);
}

.search-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-file-count {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hover-bg);
  color: var(--muted);
}

.search-match-list {
  padding-left: 20px;
}

.search-match-item {
  display: flex;
  gap: 8px;
  padding: 3px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: Consolas, "Courier New", monospace;
}

.search-match-item:hover {
  background: var(--active-row-bg);
}

.search-match-line {
  color: var(--accent);
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.search-match-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.search-file-badge {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--accent);
  color: #fff;
  flex-shrink: 0;
  line-height: 16px;
}
</style>
