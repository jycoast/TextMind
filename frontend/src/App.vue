<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import TopBar from "@/components/TopBar.vue";
import TabBar from "@/components/TabBar.vue";
import EditorHost from "@/components/EditorHost.vue";
import FileExplorer from "@/components/FileExplorer.vue";
import ExplorerSplitter from "@/components/ExplorerSplitter.vue";
import BottomBar from "@/components/BottomBar.vue";
import ContextMenu from "@/components/ContextMenu.vue";
import TabContextMenu from "@/components/TabContextMenu.vue";
import TemplateModal from "@/components/TemplateModal.vue";
import ExtractModal from "@/components/ExtractModal.vue";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useRecentStore } from "@/stores/recent";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { backend } from "@/api/backend";
import { guessLanguageByFilename } from "@/composables/useLanguageGuess";
import { pathBaseName } from "@/utils/normalize";
import {
  installSessionAutoSave,
  loadSessionIntoStores,
} from "@/composables/useSession";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { tryFormatJson, tryMinifyJson } from "@/composables/useJsonFormat";

const tabs = useTabsStore();
const menus = useMenusStore();
const recents = useRecentStore();
const workspace = useWorkspaceStore();
const ui = useUiStore();
const { tabs: tabList } = storeToRefs(tabs);

const templateVisible = ref(false);
const templateInitialData = ref("");

const extractVisible = ref(false);
const extractSource = ref("");

function showTemplate() {
  menus.closeEverything();
  const sel = tabs.getSelectionText();
  templateInitialData.value = sel.trim() ? sel : "";
  templateVisible.value = true;
}

function hideTemplate() {
  templateVisible.value = false;
}

function showExtract() {
  menus.closeEverything();
  const sel = tabs.getSelectionText();
  extractSource.value = sel.trim()
    ? sel
    : (tabs.adapter?.getValue() ?? "");
  if (!extractSource.value.trim()) {
    ui.showTip("没有可提取的文本");
    return;
  }
  extractVisible.value = true;
}

function hideExtract() {
  extractVisible.value = false;
}

function onExtractInsert(text: string) {
  const ok = tabs.replaceSelection(text);
  if (!ok) {
    ui.showTip('当前没有选区可替换，请改用"新建Tab输出"');
    return;
  }
  hideExtract();
  ui.showTip("提取完成");
}

function onExtractNewTab(text: string) {
  tabs.addTabFromText("提取结果", text, "plaintext");
  hideExtract();
  ui.showTip("提取完成");
}

async function onOpenFile() {
  menus.closeAllTopMenus();
  const res = await backend.openTextFile();
  if (!res) return;
  if (res.error) {
    ui.showTip(res.error);
    return;
  }
  if (!res.path) return;
  const result = tabs.openFileResultToTab(res);
  recents.push(
    res.path,
    res.name,
    guessLanguageByFilename(res.name || res.path),
  );
  if (result?.reloaded) {
    ui.showTip(`已重新加载 ${res.name || "文件"}`);
  } else if (result?.existed) {
    ui.showTip(`文件已打开，已切换到 ${res.name || "对应Tab"}`);
  } else {
    ui.showTip(`已打开 ${res.name || "文件"}`);
  }
}

async function onOpenFolder() {
  menus.closeAllTopMenus();
  const res = await backend.openFolder();
  if (!res) return;
  if (res.error) {
    ui.showTip(res.error);
    return;
  }
  if (!res.path) return;
  await workspace.setRoot(res.path);
  ui.showTip(`已打开文件夹 ${pathBaseName(res.path) || res.path}`);
}

async function onOpenFileByPath(path: string) {
  const p = String(path || "").trim();
  if (!p) return;
  menus.closeAllTopMenus();
  const res = await backend.openTextFileByPath(p);
  if (!res) return;
  if (res.error) {
    ui.showTip(res.error);
    recents.remove(p);
    return;
  }
  if (!res.path) return;
  const result = tabs.openFileResultToTab(res);
  recents.push(
    res.path,
    res.name,
    guessLanguageByFilename(res.name || res.path),
  );
  if (result?.reloaded) {
    ui.showTip(`已重新加载 ${res.name || "文件"}`);
  } else if (result?.existed) {
    ui.showTip(`文件已打开，已切换到 ${res.name || "对应Tab"}`);
  } else {
    ui.showTip(`已打开 ${res.name || "文件"}`);
  }
}

async function onSaveCurrent() {
  menus.closeAllTopMenus();
  const r = await tabs.saveCurrent();
  if (r.error) {
    ui.showTip(r.error);
    return;
  }
  if (r.ok) ui.showTip(`已保存 ${r.name || ""}`);
}

async function onContextAction(action: "dedupe" | "singleton" | "inlist") {
  const selected = tabs.getSelectionText();
  if (!selected.trim()) return;
  if (action === "dedupe") {
    const res = await backend.dedupeSelected(selected);
    if (res?.text != null) {
      tabs.replaceSelection(res.text);
      const removed = Number(res.removed) || 0;
      const msg = `去重完成，去重 ${removed} 条`;
      ui.showTip(msg);
      ui.showCenterNotice(msg);
    }
    return;
  }
  if (action === "singleton") {
    const res = await backend.keepSingletonSelected(selected);
    if (res?.text != null) tabs.replaceSelection(res.text);
    return;
  }
  if (action === "inlist") {
    const res = await backend.toInListSelected(selected);
    if (res?.text != null) tabs.replaceSelection(res.text);
  }
}

function onToggleColumn() {
  const { ok, applied } = tabs.toggleColumnMode();
  if (!ok && applied) {
    ui.showTip("仅 Monaco 支持列编辑");
  }
}

function runJsonOp(variant: "format" | "minify") {
  menus.closeEverything();
  const sel = tabs.getSelectionText();
  const useSelection = sel.trim().length > 0;
  const source = useSelection ? sel : tabs.adapter?.getValue() ?? "";
  if (!source.trim()) {
    ui.showTip("没有可处理的文本");
    return;
  }
  const res =
    variant === "format" ? tryFormatJson(source, 2) : tryMinifyJson(source);
  if (!res.ok) {
    ui.showTip(`JSON 解析失败：${res.error}`);
    return;
  }
  if (useSelection) {
    tabs.replaceSelection(res.text);
  } else if (tabs.adapter) {
    tabs.adapter.setValue(res.text);
  }
  ui.showTip(variant === "format" ? "已格式化 JSON" : "已压缩 JSON");
}

function onFormatJson() {
  runJsonOp("format");
}

function onMinifyJson() {
  runJsonOp("minify");
}

function onEditorMenuAction(
  action:
    | "extract"
    | "dedupe"
    | "singleton"
    | "inlist"
    | "format-json"
    | "minify-json",
) {
  if (action === "extract") return showExtract();
  if (action === "format-json") return onFormatJson();
  if (action === "minify-json") return onMinifyJson();
  return onContextAction(action);
}

function onDetectLanguage() {
  menus.closeEverything();
  const res = tabs.detectAndApplyCurrentLanguage();
  if (!res.ok) {
    ui.showTip("未能识别出语言");
    return;
  }
  ui.showTip(`已切换语言：${res.language}`);
}

function onTemplateInsert(text: string) {
  const ok = tabs.replaceSelection(text);
  if (!ok) {
    ui.showTip('当前没有选区可替换，请改用"新建Tab输出"');
    return;
  }
  hideTemplate();
  ui.showTip("批量生成完成");
}

function onTemplateNewTab(text: string) {
  tabs.addTabFromText("批量SQL结果", text, "sql");
  hideTemplate();
  ui.showTip("批量生成完成");
}

function onAppClick(ev: MouseEvent) {
  menus.closeEditorContextMenu();
  menus.closeTabContextMenu();
  const target = ev.target as HTMLElement | null;
  if (!target?.closest("[data-menu-root]")) {
    menus.closeAllTopMenus();
  }
}

useKeyboardShortcuts({
  onSave: () => void onSaveCurrent(),
  onOpenTemplate: showTemplate,
  onToggleColumnMode: onToggleColumn,
  onEscape: () => {
    if (extractVisible.value) {
      hideExtract();
      return;
    }
    if (templateVisible.value) {
      hideTemplate();
      return;
    }
    menus.closeEverything();
  },
});

async function openLaunchFileIfAny() {
  const path = await backend.consumeLaunchPath();
  if (!path) return;
  await onOpenFileByPath(path);
}

onMounted(async () => {
  await loadSessionIntoStores();
  if (workspace.root) {
    await workspace.setRoot(workspace.root);
  }
  await openLaunchFileIfAny();
  installSessionAutoSave();
});
</script>

<template>
  <TopBar
    data-menu-root
    @save="onSaveCurrent"
    @open-file="onOpenFile"
    @open-folder="onOpenFolder"
    @open-recent="(p: string) => onOpenFileByPath(p)"
    @extract="showExtract"
    @dedupe="onContextAction('dedupe')"
    @singleton="onContextAction('singleton')"
    @inlist="onContextAction('inlist')"
    @template-sql="showTemplate"
    @toggle-column="onToggleColumn"
    @format-json="onFormatJson"
    @minify-json="onMinifyJson"
    @detect-language="onDetectLanguage"
  />
  <div class="workbench flex flex-1 min-h-0 overflow-hidden" @click="onAppClick">
    <FileExplorer @open-file="(p) => onOpenFileByPath(p)" />
    <ExplorerSplitter />
    <div class="editor-pane flex-1 min-w-0 min-h-0 flex flex-col">
      <TabBar />
      <EditorHost />
    </div>
  </div>
  <BottomBar />
  <ContextMenu @action="onEditorMenuAction" />
  <TabContextMenu />
  <TemplateModal
    :visible="templateVisible"
    :initial-data="templateInitialData"
    @close="hideTemplate"
    @insert="onTemplateInsert"
    @new-tab="onTemplateNewTab"
  />
  <ExtractModal
    :visible="extractVisible"
    :source="extractSource"
    @close="hideExtract"
    @insert="onExtractInsert"
    @new-tab="onExtractNewTab"
  />
  <div class="sr-only">{{ tabList.length }}</div>
</template>
