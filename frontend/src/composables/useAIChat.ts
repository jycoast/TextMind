import { EventsOff, EventsOn } from "@wails/runtime/runtime";
import { backend } from "@/api/backend";
import { useAIConfigStore } from "@/stores/aiConfig";
import { useAIChatStore } from "@/stores/aiChat";
import type { main } from "@wails/go/models";

export interface SendOptions {
  conversationId: string;
  userMessage: string;
  /** Optional system prompt override; falls back to AIConfig.systemPrompt. */
  systemPrompt?: string;
  /** Optional model override; falls back to AIConfig.defaultModel. */
  model?: string;
}

export interface InlineSendOptions {
  /** The full prompt to send (no persistence). */
  prompt: string;
  systemPrompt?: string;
  model?: string;
  /** Streamed chunks; called repeatedly. */
  onDelta: (delta: string) => void;
  /** Called once when the stream ends normally. content is the final text. */
  onDone: (content: string) => void;
  /** Called on error or cancel. */
  onError: (error: string, partial: string) => void;
}

export interface InlineHandle {
  streamId: string;
  cancel: () => Promise<void>;
}

export interface ConversationHandle {
  streamId: string;
  cancel: () => Promise<void>;
  /** Resolves when stream completes (done or error). */
  done: Promise<void>;
}

interface ChunkPayload {
  delta?: string;
  role?: string;
}

interface DonePayload {
  finishReason?: string;
  content?: string;
}

interface ErrorPayload {
  error?: string;
  content?: string;
}

function unsubscribeAll(unsubs: Array<() => void>): void {
  for (const fn of unsubs) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function listen<T>(eventName: string, handler: (payload: T) => void): () => void {
  const off = EventsOn(eventName, (payload: T) => handler(payload));
  return () => {
    try {
      off?.();
    } catch {
      /* ignore */
    }
    EventsOff(eventName);
  };
}

/**
 * useAIChat groups the high-level send/cancel actions for the chat panel
 * (persistent) and the inline rewrite modal (ephemeral).
 *
 * Both flavours subscribe to ai:stream:<id>:chunk/done/error events and
 * forward them through the appropriate stores or callbacks.
 */
export function useAIChat() {
  const cfgStore = useAIConfigStore();
  const chatStore = useAIChatStore();

  /**
   * sendInConversation appends the user's message to the active conversation
   * and streams the assistant reply into the chat store. The returned
   * `done` promise resolves once the stream finishes (success or failure).
   */
  async function sendInConversation(
    opts: SendOptions,
  ): Promise<ConversationHandle | { error: string }> {
    if (!cfgStore.isConfigured) {
      return { error: "请先在 设置 → AI 设置 中填入 Base URL 和默认模型" };
    }
    const conversationId = opts.conversationId;
    if (!conversationId) return { error: "未选择会话" };

    const model = opts.model || cfgStore.config.defaultModel;
    const systemPrompt =
      opts.systemPrompt !== undefined
        ? opts.systemPrompt
        : cfgStore.config.systemPrompt || "";

    // Build full message history sent to the API: system + persisted msgs + new user.
    const history = chatStore.activeConversation?.messages ?? [];
    const apiMessages: main.ChatMessageDTO[] = [];
    if (systemPrompt.trim()) {
      apiMessages.push({ role: "system", content: systemPrompt });
    }
    for (const m of history) {
      apiMessages.push({ role: m.role, content: m.content });
    }
    apiMessages.push({ role: "user", content: opts.userMessage });

    // Optimistic local update: show the user message immediately.
    const nowSec = Math.floor(Date.now() / 1000);
    chatStore.appendMessageLocal({
      role: "user",
      content: opts.userMessage,
      createdAt: nowSec,
    });

    const result = await backend.startChatStream({
      messages: apiMessages,
      conversationId,
      userMessage: opts.userMessage,
      model,
    } as main.StartChatRequest);

    if (result?.error || !result?.streamId) {
      return { error: result?.error || "启动对话失败" };
    }

    const streamId = result.streamId;
    chatStore.setStream(
      { conversationId, streamId, buffer: "", startedAt: Date.now() },
      conversationId,
    );

    let resolveDone: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const unsubs: Array<() => void> = [];
    const finalize = (
      finalContent: string,
      errorMsg: string | null,
    ): void => {
      // Refresh persisted state so the assistant message saved on the backend
      // becomes visible (the optimistic user message is already in place).
      chatStore
        .selectConversation(conversationId, false)
        .catch(() => {})
        .finally(() => {
          chatStore.setStream(null, conversationId);
          chatStore.loadList().catch(() => {});
          if (errorMsg) {
            chatStore.lastError = errorMsg;
          }
          unsubscribeAll(unsubs);
          resolveDone?.();
        });
      // Mark unused params so consumers can extend later if needed.
      void finalContent;
    };

    unsubs.push(
      listen<ChunkPayload>("ai:stream:" + streamId + ":chunk", (payload) => {
        if (payload?.delta) {
          chatStore.appendStreamChunk(conversationId, payload.delta);
        }
      }),
    );
    unsubs.push(
      listen<DonePayload>("ai:stream:" + streamId + ":done", (payload) => {
        finalize(payload?.content || "", null);
      }),
    );
    unsubs.push(
      listen<ErrorPayload>("ai:stream:" + streamId + ":error", (payload) => {
        finalize(payload?.content || "", payload?.error || "对话失败");
      }),
    );

    return {
      streamId,
      cancel: async () => {
        await backend.cancelChatStream(streamId).catch(() => {});
      },
      done: donePromise,
    };
  }

  /**
   * sendInline streams a one-shot completion without touching persistent
   * conversations. Used by the inline rewrite modal.
   */
  async function sendInline(
    opts: InlineSendOptions,
  ): Promise<InlineHandle | { error: string }> {
    if (!cfgStore.isConfigured) {
      return { error: "请先在 设置 → AI 设置 中填入 Base URL 和默认模型" };
    }
    const model = opts.model || cfgStore.config.defaultModel;
    const apiMessages: main.ChatMessageDTO[] = [];
    const systemPrompt =
      opts.systemPrompt !== undefined
        ? opts.systemPrompt
        : cfgStore.config.systemPrompt || "";
    if (systemPrompt.trim()) {
      apiMessages.push({ role: "system", content: systemPrompt });
    }
    apiMessages.push({ role: "user", content: opts.prompt });

    const result = await backend.startChatStream({
      messages: apiMessages,
      model,
    } as main.StartChatRequest);

    if (result?.error || !result?.streamId) {
      return { error: result?.error || "启动对话失败" };
    }

    const streamId = result.streamId;
    let buffer = "";
    const unsubs: Array<() => void> = [];

    const cleanup = () => unsubscribeAll(unsubs);

    unsubs.push(
      listen<ChunkPayload>("ai:stream:" + streamId + ":chunk", (payload) => {
        if (payload?.delta) {
          buffer += payload.delta;
          opts.onDelta(payload.delta);
        }
      }),
    );
    unsubs.push(
      listen<DonePayload>("ai:stream:" + streamId + ":done", (payload) => {
        const final = payload?.content ?? buffer;
        cleanup();
        opts.onDone(final);
      }),
    );
    unsubs.push(
      listen<ErrorPayload>("ai:stream:" + streamId + ":error", (payload) => {
        const final = payload?.content ?? buffer;
        cleanup();
        opts.onError(payload?.error || "对话失败", final);
      }),
    );

    return {
      streamId,
      cancel: async () => {
        await backend.cancelChatStream(streamId).catch(() => {});
      },
    };
  }

  return {
    sendInConversation,
    sendInline,
  };
}
