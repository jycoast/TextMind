<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAIPanelStore } from "@/stores/aiPanel";
import { useAIChatStore, type ChatMessage } from "@/stores/aiChat";
import { useAIConfigStore } from "@/stores/aiConfig";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { useAIChat, type ConversationHandle } from "@/composables/useAIChat";
import { renderMarkdown } from "@/composables/useMarkdown";
import { backend } from "@/api/backend";

const emit = defineEmits<{
  (e: "open-settings"): void;
}>();

const panel = useAIPanelStore();
const chat = useAIChatStore();
const cfg = useAIConfigStore();
const tabs = useTabsStore();
const ui = useUiStore();
const chatApi = useAIChat();

const { width, visible } = storeToRefs(panel);

const inputText = ref<string>("");
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLDivElement | null>(null);
const renamingId = ref<string>("");
const renamingTitle = ref<string>("");

const activeStream = computed(() =>
  chat.selectedId ? chat.getStream(chat.selectedId) : null,
);

const messages = computed<ChatMessage[]>(() => {
  return chat.activeConversation?.messages ?? [];
});

const conversationsList = computed(() => chat.conversations);

// The model actually used for the next send. Defaults to the active
// conversation's pinned model, or the global default when the conversation
// hasn't been pinned yet. Stays in sync with conversation switches via the
// watch below.
const currentModel = computed<string>({
  get() {
    return (
      chat.activeConversation?.model || cfg.config.defaultModel || ""
    );
  },
  set(next: string) {
    const id = chat.selectedId;
    if (!id) return;
    chat.setConversationModel(id, next).catch(() => {});
  },
});

// Models the dropdown lists: the active conversation's stored model is
// guaranteed to be present even if it's no longer in the user's saved list,
// so we don't accidentally hide what's actually being sent.
const modelOptions = computed<string[]>(() => {
  const list = [...cfg.availableModels];
  const pinned = chat.activeConversation?.model;
  if (pinned && !list.includes(pinned)) list.unshift(pinned);
  return list;
});

const placeholder = computed(() => {
  if (!cfg.isConfigured) return "请先在 设置 → AI 设置 中配置 Base URL 和模型...";
  if (!chat.selectedId) return "选择或新建一个会话以开始对话";
  return "Ctrl+Enter 发送，Esc 关闭面板";
});

watch(visible, async (v) => {
  if (v) {
    if (!cfg.loaded) await cfg.load();
    await chat.loadList();
    await nextTick();
    scrollToBottom();
  }
});

watch(
  () => [messages.value.length, activeStream.value?.buffer ?? ""],
  () => {
    nextTick(() => scrollToBottom());
  },
);

onMounted(async () => {
  if (!cfg.loaded) await cfg.load();
  if (visible.value) {
    await chat.loadList();
    await nextTick();
    scrollToBottom();
  }
});

function scrollToBottom() {
  const el = messagesRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function onSelect(id: string) {
  if (chat.selectedId === id) return;
  await chat.selectConversation(id);
  await nextTick();
  scrollToBottom();
}

async function onNewConversation() {
  const seed = currentModel.value || cfg.config.defaultModel;
  const conv = await chat.createConversation("新对话", seed);
  if (conv) {
    await nextTick();
    inputRef.value?.focus();
  }
}

function startRename(id: string, current: string) {
  renamingId.value = id;
  renamingTitle.value = current;
}

async function commitRename() {
  if (!renamingId.value) return;
  await chat.renameConversation(renamingId.value, renamingTitle.value.trim());
  renamingId.value = "";
  renamingTitle.value = "";
}

function cancelRename() {
  renamingId.value = "";
  renamingTitle.value = "";
}

async function onDelete(id: string) {
  if (!window.confirm("确定删除这个会话？")) return;
  await chat.deleteConversation(id);
}

let currentHandle: ConversationHandle | null = null;

async function send() {
  const text = inputText.value;
  if (!text.trim()) return;
  if (!cfg.isConfigured) {
    ui.showTip("请先在 设置 → AI 设置 中完成配置");
    return;
  }
  // Snapshot the model the user can see in the dropdown right now; this
  // value is what we'll send AND what we'll persist to the conversation.
  const sendModel = currentModel.value || cfg.config.defaultModel;
  if (!sendModel) {
    ui.showTip("请先在 设置 → AI 设置 中选择默认模型");
    return;
  }

  let conversationId = chat.selectedId;
  if (!conversationId) {
    const created = await chat.createConversation("新对话", sendModel);
    if (!created) {
      ui.showTip("创建会话失败");
      return;
    }
    conversationId = created.id;
  }
  inputText.value = "";

  const result = await chatApi.sendInConversation({
    conversationId,
    userMessage: text,
    model: sendModel,
  });
  if ("error" in result) {
    ui.showTip(result.error);
    return;
  }
  currentHandle = result;
  result.done.finally(() => {
    if (currentHandle === result) currentHandle = null;
  });
}

async function stop() {
  if (!currentHandle) {
    if (chat.selectedId) {
      const s = chat.getStream(chat.selectedId);
      if (s) {
        await backend.cancelChatStream(s.streamId).catch(() => {});
      }
    }
    return;
  }
  await currentHandle.cancel();
}

function onInputKeydown(ev: KeyboardEvent) {
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    send();
  }
}

function copyMessage(content: string) {
  if (!content) return;
  navigator.clipboard
    .writeText(content)
    .then(() => ui.showTip("已复制"))
    .catch(() => ui.showTip("复制失败"));
}

function insertIntoEditor(content: string) {
  if (!content) return;
  const ok = tabs.replaceSelection(content);
  if (!ok) {
    tabs.addTabFromText("AI 输出", content, "plaintext");
    ui.showTip("无选区，已新建Tab输出");
    return;
  }
  ui.showTip("已插入到编辑器");
}

function newTabFromMessage(content: string) {
  if (!content) return;
  tabs.addTabFromText("AI 输出", content, "plaintext");
  ui.showTip("已新建Tab");
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function closePanel() {
  panel.setVisible(false);
}
</script>

<template>
  <aside
    v-if="visible"
    class="ai-panel flex flex-col flex-none min-w-0"
    :style="{
      width: `${width}px`,
      background: 'var(--sidebar-bg)',
      borderLeft: '1px solid var(--hairline)',
      color: 'var(--text)',
    }"
  >
    <header
      class="h-8 flex items-center justify-between gap-2 px-2 flex-none"
      :style="{ borderBottom: '1px solid var(--hairline)' }"
    >
      <span class="text-[13px]" :style="{ color: 'var(--text)' }">AI 对话</span>
      <span class="flex items-center gap-1">
        <button
          class="tm-icon-btn"
          title="新建会话"
          @click="onNewConversation"
        >
          ＋
        </button>
        <button
          class="tm-icon-btn"
          title="AI 设置"
          @click="emit('open-settings')"
        >
          ⚙
        </button>
        <button class="tm-icon-btn" title="关闭面板" @click="closePanel">
          ×
        </button>
      </span>
    </header>

    <div
      v-if="conversationsList.length > 0"
      class="conv-list flex-none overflow-y-auto"
      :style="{
        maxHeight: '180px',
        borderBottom: '1px solid var(--hairline)',
      }"
    >
      <ul class="m-0 p-1">
        <li
          v-for="c in conversationsList"
          :key="c.id"
          class="flex items-center gap-1 px-2 py-1.5 text-[13px] cursor-pointer rounded-sm conv-item"
          :class="{ 'is-active': c.id === chat.selectedId }"
          @click="onSelect(c.id)"
        >
          <input
            v-if="renamingId === c.id"
            v-model="renamingTitle"
            class="flex-1 h-6 px-1 box-border rounded-sm border text-[13px] outline-none"
            :style="{
              background: 'var(--panel-input)',
              borderColor: 'var(--accent)',
              color: 'var(--text)',
            }"
            spellcheck="false"
            @click.stop
            @keydown.enter.stop="commitRename"
            @keydown.escape.stop="cancelRename"
            @blur="commitRename"
          />
          <span
            v-else
            class="flex-1 truncate"
            :style="{
              color: c.id === chat.selectedId ? 'var(--text)' : 'var(--muted)',
            }"
            :title="c.title"
            @dblclick.stop="startRename(c.id, c.title)"
          >
            {{ c.title || "未命名" }}
          </span>
          <button
            class="conv-action"
            title="重命名"
            @click.stop="startRename(c.id, c.title)"
          >
            ✎
          </button>
          <button
            class="conv-action"
            title="删除"
            @click.stop="onDelete(c.id)"
          >
            🗑
          </button>
        </li>
      </ul>
    </div>

    <div
      ref="messagesRef"
      class="messages flex-1 min-h-0 overflow-y-auto px-3 py-2"
    >
      <div
        v-if="!chat.selectedId"
        class="text-[13px] text-center mt-8"
        :style="{ color: 'var(--muted)' }"
      >
        点击左上角 ＋ 新建一个会话开始对话
      </div>

      <div v-else class="flex flex-col gap-3">
        <div
          v-for="(m, idx) in messages"
          :key="idx"
          class="msg flex flex-col gap-1"
          :class="m.role === 'user' ? 'items-end' : 'items-start'"
        >
          <div class="text-[11px]" :style="{ color: 'var(--muted)' }">
            {{ m.role === "user" ? "你" : m.role === "assistant" ? "AI" : m.role }}
            <span
              v-if="m.role === 'assistant' && chat.activeConversation?.model"
              class="font-mono"
            >
              · {{ chat.activeConversation.model }}
            </span>
            <span v-if="m.createdAt"> · {{ formatTime(m.createdAt) }}</span>
          </div>
          <div
            class="bubble max-w-full px-3 py-2 rounded-md"
            :style="
              m.role === 'user'
                ? {
                    background: 'var(--active-row-bg)',
                    border: '1px solid var(--hairline)',
                  }
                : {
                    background: 'var(--panel-elevated)',
                    border: '1px solid var(--hairline)',
                  }
            "
          >
            <div
              v-if="m.role === 'assistant'"
              class="markdown-body text-[13px] leading-relaxed"
              v-html="renderMarkdown(m.content)"
            ></div>
            <div
              v-else
              class="whitespace-pre-wrap break-words text-[13px] leading-relaxed"
              :style="{ color: 'var(--text)' }"
            >
              {{ m.content }}
            </div>
            <div
              v-if="m.role === 'assistant' && m.content"
              class="flex gap-1 mt-1.5 text-[11px]"
              :style="{ color: 'var(--muted)' }"
            >
              <button class="msg-action" @click="copyMessage(m.content)">
                复制
              </button>
              <button class="msg-action" @click="insertIntoEditor(m.content)">
                插入到编辑器
              </button>
              <button class="msg-action" @click="newTabFromMessage(m.content)">
                新建Tab
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="activeStream"
          class="msg flex flex-col gap-1 items-start"
        >
          <div class="text-[11px]" :style="{ color: 'var(--muted)' }">
            AI · 正在回复...
          </div>
          <div
            class="bubble max-w-full px-3 py-2 rounded-md"
            :style="{
              background: 'var(--panel-elevated)',
              border: '1px solid var(--hairline)',
            }"
          >
            <div
              v-if="activeStream.buffer"
              class="markdown-body text-[13px] leading-relaxed"
              v-html="renderMarkdown(activeStream.buffer)"
            ></div>
            <div
              v-else
              class="text-[13px]"
              :style="{ color: 'var(--muted)' }"
            >
              ▍
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer
      class="composer flex-none px-2 py-2"
      :style="{ borderTop: '1px solid var(--hairline)' }"
    >
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="tm-input"
        :style="{ minHeight: '70px', marginBottom: '6px' }"
        :placeholder="placeholder"
        spellcheck="false"
        @keydown="onInputKeydown"
      ></textarea>
      <div class="flex justify-between items-center gap-2">
        <span class="flex items-center gap-1 min-w-0">
          <span
            class="text-[11px] flex-none"
            :style="{ color: 'var(--muted)' }"
          >
            模型
          </span>
          <select
            v-if="modelOptions.length > 0"
            :value="currentModel"
            class="model-select font-mono text-[12px] truncate"
            :style="{
              background: 'var(--panel-input)',
              color: 'var(--text)',
              border: '1px solid var(--hairline)',
              maxWidth: '180px',
            }"
            :disabled="!chat.selectedId || Boolean(activeStream)"
            :title="
              !chat.selectedId
                ? '新建或选择会话后可切换模型'
                : currentModel
            "
            @change="
              currentModel = ($event.target as HTMLSelectElement).value
            "
          >
            <option
              v-for="m in modelOptions"
              :key="m"
              :value="m"
            >
              {{ m }}
            </option>
          </select>
          <span
            v-else
            class="text-[11px]"
            :style="{ color: 'var(--muted)' }"
          >
            未配置模型
          </span>
        </span>
        <span class="flex gap-2">
          <button
            v-if="activeStream"
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--hairline)"
            @click="stop"
          >
            停止
          </button>
          <button
            v-else
            class="tm-menu-item"
            style="width: auto; border: 1px solid var(--accent); color: var(--text)"
            :disabled="!inputText.trim()"
            @click="send"
          >
            发送
          </button>
        </span>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.tm-icon-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 2px;
  font-size: 14px;
  line-height: 1;
}
.tm-icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text);
}

.conv-item:hover {
  background: var(--hover-bg);
}
.conv-item.is-active {
  background: var(--active-row-bg);
}
.conv-action {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 2px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.12s;
}
.conv-item:hover .conv-action {
  opacity: 1;
}
.conv-action:hover {
  background: var(--hover-bg);
  color: var(--text);
}

.msg-action {
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--muted);
  padding: 1px 6px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 11px;
}
.msg-action:hover {
  color: var(--text);
}

.model-select {
  height: 22px;
  padding: 0 4px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  appearance: auto;
}
.model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.markdown-body :deep(p) {
  margin: 0 0 6px 0;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(pre) {
  background: var(--panel-input);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 8px 10px;
  overflow-x: auto;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
}
.markdown-body :deep(code) {
  background: var(--panel-input);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 0 4px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
}
.markdown-body :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 22px;
  margin: 4px 0;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--hairline);
  margin: 4px 0;
  padding-left: 10px;
  color: var(--muted);
}
.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--hairline);
  padding: 4px 8px;
}
</style>
