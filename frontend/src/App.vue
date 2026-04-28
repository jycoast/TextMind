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
import AIChatPanel from "@/components/AIChatPanel.vue";
import AIPanelSplitter from "@/components/AIPanelSplitter.vue";
import AISettingsModal from "@/components/AISettingsModal.vue";
import AIInlineModal from "@/components/AIInlineModal.vue";
import UpdateModal from "@/components/UpdateModal.vue";
import { useTabsStore } from "@/stores/tabs";
import { useMenusStore } from "@/stores/menus";
import { useRecentStore } from "@/stores/recent";
import { useWorkspaceStore } from "@/stores/workspace";
import { useUiStore } from "@/stores/ui";
import { useAIPanelStore } from "@/stores/aiPanel";
import { useAIConfigStore } from "@/stores/aiConfig";
import { useAIChatStore } from "@/stores/aiChat";
import { useUpdateStore } from "@/stores/update";
import { useAIChat } from "@/composables/useAIChat";
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
const aiPanel = useAIPanelStore();
const aiConfig = useAIConfigStore();
const aiChat = useAIChatStore();
const updateStore = useUpdateStore();
const aiApi = useAIChat();
const { tabs: tabList } = storeToRefs(tabs);

const templateVisible = ref(false);
const templateInitialData = ref("");

const extractVisible = ref(false);
const extractSource = ref("");

const aiSettingsVisible = ref(false);
const aiInlineVisible = ref(false);
const aiInlineSource = ref("");

const updateModalVisible = ref(false);

// 24h between auto-checks; explicit user clicks always force a fresh check.
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Wait a few seconds after launch before going to the network so the
// editor finishes loading first. Network failures are silent.
const AUTO_CHECK_DELAY_MS = 8000;

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

function showAISettings() {
  menus.closeEverything();
  aiSettingsVisible.value = true;
}

function hideAISettings() {
  aiSettingsVisible.value = false;
}

function showUpdateModal() {
  menus.closeEverything();
  updateModalVisible.value = true;
}

function hideUpdateModal() {
  updateModalVisible.value = false;
}

async function maybeAutoCheckUpdate() {
  // Throttle: skip if we already checked within the last 24h.
  const last = Number(updateStore.lastCheckMs) || 0;
  if (last && Date.now() - last < AUTO_CHECK_INTERVAL_MS) return;
  // Silent mode: any failure is swallowed; only pop the modal if a real
  // update is found, so users with no internet aren't nagged.
  const res = await updateStore.check(true);
  if (res?.hasUpdate) {
    updateModalVisible.value = true;
  }
}

function toggleAIPanel() {
  aiPanel.toggleVisible();
  if (aiPanel.visible) {
    if (!aiConfig.loaded) {
      aiConfig.load().catch(() => {});
    }
    aiChat.loadList().catch(() => {});
  }
  setTimeout(() => tabs.adapter?.forceRefresh(), 0);
}

function showAIInline() {
  menus.closeEverything();
  const sel = tabs.getSelectionText();
  aiInlineSource.value = sel.trim() ? sel : (tabs.adapter?.getValue() ?? "");
  if (!aiInlineSource.value.trim()) {
    ui.showTip("没有可处理的文本");
    return;
  }
  aiInlineVisible.value = true;
}

function hideAIInline() {
  aiInlineVisible.value = false;
}

function onAIInlineReplace(text: string) {
  const ok = tabs.replaceSelection(text);
  if (!ok) {
    ui.showTip('当前没有选区可替换，请改用"插入到光标"或"送入面板"');
    return;
  }
  hideAIInline();
  ui.showTip("已替换选区");
}

function onAIInlineInsert(text: string) {
  const ok = tabs.replaceSelection(text);
  if (!ok) {
    tabs.addTabFromText("AI 输出", text, "plaintext");
    ui.showTip("无插入位置，已新建Tab");
  } else {
    ui.showTip("已插入到光标");
  }
  hideAIInline();
}

async function onAIInlineSendToPanel(
  userMessage: string,
  assistantMessage: string,
) {
  hideAIInline();
  aiPanel.setVisible(true);
  if (!aiConfig.loaded) await aiConfig.load();
  await aiChat.loadList();
  const conv = await aiChat.createConversation(
    "选区对话",
    aiConfig.config.defaultModel,
  );
  if (!conv) {
    ui.showTip("创建会话失败");
    return;
  }
  // Replay the inline exchange in the new conversation. We use sendInConversation
  // so the assistant continuation remains streaming-capable, but for now we
  // simply seed the conversation by issuing the same user message and ignore
  // the assistantMessage we already produced (the API gives a fresh answer).
  void assistantMessage;
  const result = await aiApi.sendInConversation({
    conversationId: conv.id,
    userMessage,
  });
  if ("error" in result) {
    ui.showTip(result.error);
  }
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
    | "minify-json"
    | "ai-inline",
) {
  if (action === "extract") return showExtract();
  if (action === "format-json") return onFormatJson();
  if (action === "minify-json") return onMinifyJson();
  if (action === "ai-inline") return showAIInline();
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
  onToggleAIPanel: toggleAIPanel,
  onEscape: () => {
    if (updateModalVisible.value) {
      hideUpdateModal();
      return;
    }
    if (aiInlineVisible.value) {
      hideAIInline();
      return;
    }
    if (aiSettingsVisible.value) {
      hideAISettings();
      return;
    }
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

  // Background update check after the editor settles. Errors are silent.
  setTimeout(() => {
    maybeAutoCheckUpdate().catch(() => {});
  }, AUTO_CHECK_DELAY_MS);
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
    @ai-inline="showAIInline"
    @open-ai-settings="showAISettings"
    @toggle-ai-panel="toggleAIPanel"
    @check-for-updates="showUpdateModal"
  />
  <div class="workbench flex flex-1 min-h-0 overflow-hidden" @click="onAppClick">
    <FileExplorer @open-file="(p) => onOpenFileByPath(p)" />
    <ExplorerSplitter />
    <div class="editor-pane flex-1 min-w-0 min-h-0 flex flex-col">
      <TabBar />
      <EditorHost />
    </div>
    <AIPanelSplitter v-if="aiPanel.visible" />
    <AIChatPanel v-if="aiPanel.visible" @open-settings="showAISettings" />
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
  <AISettingsModal :visible="aiSettingsVisible" @close="hideAISettings" />
  <AIInlineModal
    :visible="aiInlineVisible"
    :source="aiInlineSource"
    @close="hideAIInline"
    @replace="onAIInlineReplace"
    @insert="onAIInlineInsert"
    @send-to-panel="onAIInlineSendToPanel"
  />
  <UpdateModal :visible="updateModalVisible" @close="hideUpdateModal" />
  <div class="sr-only">{{ tabList.length }}</div>
</template>
