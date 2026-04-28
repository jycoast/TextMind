import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import { backend } from "@/api/backend";

export interface ChatMessage {
  role: string;
  content: string;
  createdAt?: number;
}

export interface ConversationMeta {
  id: string;
  title: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation extends ConversationMeta {
  messages: ChatMessage[];
}

function toChatMessage(raw: { role?: string; content?: string; createdAt?: number }): ChatMessage {
  return {
    role: String(raw?.role ?? ""),
    content: String(raw?.content ?? ""),
    createdAt: typeof raw?.createdAt === "number" ? raw.createdAt : undefined,
  };
}

function toConversationMeta(raw: ConversationMeta): ConversationMeta {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? ""),
    model: raw?.model ? String(raw.model) : undefined,
    createdAt: Number(raw?.createdAt) || 0,
    updatedAt: Number(raw?.updatedAt) || 0,
  };
}

export interface StreamingState {
  conversationId: string;
  streamId: string;
  buffer: string;
  startedAt: number;
}

export const useAIChatStore = defineStore("aiChat", () => {
  const conversations = ref<ConversationMeta[]>([]);
  const selectedId = ref<string>("");
  const activeConversation = ref<Conversation | null>(null);
  const loading = ref<boolean>(false);
  const lastError = ref<string>("");

  // Map<conversationId, StreamingState> - tracks in-flight streams per
  // conversation so we can render a "typing" bubble even when the user
  // switches conversations.
  const streams = ref<Record<string, StreamingState>>({});

  const hasActiveStream = computed<boolean>(() =>
    Boolean(selectedId.value && streams.value[selectedId.value]),
  );

  async function loadList(): Promise<void> {
    try {
      const res = await backend.listConversations();
      const list = Array.isArray(res?.conversations) ? res.conversations : [];
      conversations.value = list.map(toConversationMeta);
      const restored = res?.selectedId || "";
      if (restored && conversations.value.some((c) => c.id === restored)) {
        await selectConversation(restored, false);
      } else if (selectedId.value) {
        // Selected id may have been deleted by another process.
        if (!conversations.value.some((c) => c.id === selectedId.value)) {
          selectedId.value = "";
          activeConversation.value = null;
        }
      }
    } catch (err) {
      lastError.value = (err as Error)?.message || String(err);
    }
  }

  async function selectConversation(
    id: string,
    persistRemote: boolean = true,
  ): Promise<void> {
    if (!id) {
      selectedId.value = "";
      activeConversation.value = null;
      if (persistRemote) await backend.selectConversation("").catch(() => {});
      return;
    }
    loading.value = true;
    try {
      const conv = await backend.getConversation(id);
      if (!conv?.id) {
        return;
      }
      selectedId.value = id;
      activeConversation.value = {
        id: String(conv.id),
        title: String(conv.title ?? ""),
        model: conv.model ? String(conv.model) : undefined,
        createdAt: Number(conv.createdAt) || 0,
        updatedAt: Number(conv.updatedAt) || 0,
        messages: Array.isArray(conv.messages)
          ? conv.messages.map(toChatMessage)
          : [],
      };
      if (persistRemote) {
        await backend.selectConversation(id).catch(() => {});
      }
    } finally {
      loading.value = false;
    }
  }

  async function createConversation(
    title: string = "新对话",
    model: string = "",
  ): Promise<Conversation | null> {
    const conv = await backend.createConversation(title, model);
    if (!conv?.id) return null;
    await loadList();
    await selectConversation(conv.id);
    return activeConversation.value;
  }

  async function renameConversation(
    id: string,
    title: string,
  ): Promise<boolean> {
    const res = await backend.renameConversation(id, title);
    if (res?.error) {
      lastError.value = res.error;
      return false;
    }
    await loadList();
    if (selectedId.value === id && activeConversation.value) {
      activeConversation.value.title = title;
    }
    return true;
  }

  async function setConversationModel(
    id: string,
    model: string,
  ): Promise<boolean> {
    if (!id) return false;
    const res = await backend.setConversationModel(id, model);
    if (res?.error) {
      lastError.value = res.error;
      return false;
    }
    if (activeConversation.value && activeConversation.value.id === id) {
      activeConversation.value = {
        ...activeConversation.value,
        model: model || undefined,
      };
    }
    const idx = conversations.value.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const next = [...conversations.value];
      next[idx] = { ...next[idx], model: model || undefined };
      conversations.value = next;
    }
    return true;
  }

  async function deleteConversation(id: string): Promise<boolean> {
    const res = await backend.deleteConversation(id);
    if (res?.error) {
      lastError.value = res.error;
      return false;
    }
    if (selectedId.value === id) {
      selectedId.value = "";
      activeConversation.value = null;
    }
    delete streams.value[id];
    await loadList();
    return true;
  }

  function setActiveMessages(messages: ChatMessage[]): void {
    if (!activeConversation.value) return;
    activeConversation.value.messages = messages;
  }

  function appendMessageLocal(msg: ChatMessage): void {
    if (!activeConversation.value) return;
    activeConversation.value.messages = [
      ...activeConversation.value.messages,
      msg,
    ];
  }

  function setStream(state: StreamingState | null, conversationId: string) {
    if (!conversationId) return;
    if (state == null) {
      delete streams.value[conversationId];
      streams.value = { ...streams.value };
    } else {
      streams.value = { ...streams.value, [conversationId]: state };
    }
  }

  function appendStreamChunk(conversationId: string, delta: string): void {
    const cur = streams.value[conversationId];
    if (!cur) return;
    cur.buffer += delta;
    streams.value = { ...streams.value, [conversationId]: { ...cur } };
  }

  function getStream(conversationId: string): StreamingState | null {
    return streams.value[conversationId] || null;
  }

  return {
    conversations,
    selectedId,
    activeConversation,
    loading,
    lastError,
    streams,
    hasActiveStream,
    loadList,
    selectConversation,
    createConversation,
    renameConversation,
    setConversationModel,
    deleteConversation,
    setActiveMessages,
    appendMessageLocal,
    setStream,
    appendStreamChunk,
    getStream,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIChatStore, import.meta.hot));
}
