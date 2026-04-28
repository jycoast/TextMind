import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import type { main } from "@wails/go/models";
import { backend } from "@/api/backend";

export type AIConfig = main.AIConfigDTO;

function emptyConfig(): AIConfig {
  return {
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
    models: [],
    systemPrompt: "",
  };
}

export const useAIConfigStore = defineStore("aiConfig", () => {
  const config = ref<AIConfig>(emptyConfig());
  const loaded = ref<boolean>(false);
  const saving = ref<boolean>(false);
  const lastError = ref<string>("");

  const isConfigured = computed<boolean>(
    () =>
      Boolean(config.value.baseUrl?.trim()) &&
      Boolean(config.value.defaultModel?.trim()),
  );

  const availableModels = computed<string[]>(() => {
    const list = Array.isArray(config.value.models) ? config.value.models : [];
    const merged: string[] = [];
    if (config.value.defaultModel) merged.push(config.value.defaultModel);
    for (const m of list) {
      if (m && !merged.includes(m)) merged.push(m);
    }
    return merged;
  });

  async function load(): Promise<void> {
    try {
      const cfg = await backend.getAIConfig();
      config.value = {
        baseUrl: cfg.baseUrl ?? "",
        apiKey: cfg.apiKey ?? "",
        defaultModel: cfg.defaultModel ?? "",
        models: Array.isArray(cfg.models) ? cfg.models : [],
        systemPrompt: cfg.systemPrompt ?? "",
      };
      lastError.value = "";
    } catch (err) {
      lastError.value = (err as Error)?.message || String(err);
    } finally {
      loaded.value = true;
    }
  }

  async function save(next: AIConfig): Promise<{ ok: boolean; error?: string }> {
    saving.value = true;
    try {
      const res = await backend.saveAIConfig(next);
      if (res?.error) {
        lastError.value = res.error;
        return { ok: false, error: res.error };
      }
      config.value = { ...next };
      lastError.value = "";
      return { ok: true };
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      lastError.value = msg;
      return { ok: false, error: msg };
    } finally {
      saving.value = false;
    }
  }

  async function testConnection(
    cfg: AIConfig,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await backend.testAIConnection(cfg);
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || String(err) };
    }
  }

  async function fetchProviderModels(
    cfg: AIConfig,
  ): Promise<{ ok: boolean; error?: string; models: string[] }> {
    try {
      const res = await backend.fetchAIModels(cfg);
      if (res?.error) {
        return { ok: false, error: res.error, models: [] };
      }
      const ids = Array.isArray(res?.models)
        ? res.models.map((m) => m.id).filter((s): s is string => Boolean(s))
        : [];
      return { ok: true, models: ids };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error)?.message || String(err),
        models: [],
      };
    }
  }

  return {
    config,
    loaded,
    saving,
    lastError,
    isConfigured,
    availableModels,
    load,
    save,
    testConnection,
    fetchProviderModels,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIConfigStore, import.meta.hot));
}
