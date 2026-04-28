import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import { EventsOff, EventsOn } from "@wails/runtime/runtime";
import type { main } from "@wails/go/models";
import { backend } from "@/api/backend";

/**
 * UpdateStatus drives the modal's visible state.
 *
 *   idle        - nothing in flight
 *   checking    - hit GitHub releases API
 *   up-to-date  - we are at or ahead of the latest release
 *   available   - newer release exists; user has not acted yet
 *   downloading - asset is being fetched to %TEMP%
 *   applying    - swap helper has been launched, app will exit shortly
 *   error       - any of the above failed; the message lives in `error`
 */
export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "applying"
  | "error";

const LAST_CHECK_KEY = "tinyEditor.updateLastCheckMs";
const PROGRESS_EVENT = "update:progress";

interface ProgressPayload {
  phase?: string;
  downloaded?: number;
  total?: number;
  error?: string;
}

function readLastCheckMs(): number {
  try {
    const n = Number(window.localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastCheckMs(ms: number): void {
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

export const useUpdateStore = defineStore("update", () => {
  const status = ref<UpdateStatus>("idle");
  const error = ref<string>("");

  const appVersion = ref<string>("");
  const info = ref<main.UpdateInfoDTO | null>(null);

  const downloadedBytes = ref<number>(0);
  const totalBytes = ref<number>(0);

  const lastCheckMs = ref<number>(readLastCheckMs());

  let progressOff: (() => void) | null = null;

  const hasUpdate = computed<boolean>(() => Boolean(info.value?.hasUpdate));

  const downloadProgress = computed<number>(() => {
    if (!totalBytes.value) return 0;
    return Math.min(
      100,
      Math.floor((downloadedBytes.value / totalBytes.value) * 100),
    );
  });

  const canAutoInstall = computed<boolean>(
    () => info.value?.canAutoInstall === true && Boolean(info.value?.asset?.url),
  );

  /**
   * loadAppVersion caches the running build's version string. It's a no-op
   * after the first successful call — the version doesn't change at runtime.
   */
  async function loadAppVersion(): Promise<void> {
    if (appVersion.value) return;
    try {
      appVersion.value = await backend.getAppVersion();
    } catch (err) {
      // Non-fatal: the modal will fall back to "未知" for the version line.
      // eslint-disable-next-line no-console
      console.warn("getAppVersion failed", err);
    }
  }

  /**
   * check polls GitHub for the latest release.
   *
   * `silent` mode is used for the startup auto-check: errors are swallowed
   * (we never block the user with a "no internet" toast at launch) and the
   * modal is only auto-opened by the caller when hasUpdate becomes true.
   */
  async function check(
    silent: boolean = false,
  ): Promise<main.UpdateInfoDTO | null> {
    if (status.value === "checking") return info.value;

    status.value = "checking";
    error.value = "";
    try {
      const res = await backend.checkForUpdate();
      info.value = res;
      lastCheckMs.value = Date.now();
      writeLastCheckMs(lastCheckMs.value);

      if (!res.ok || res.error) {
        if (!silent) {
          status.value = "error";
          error.value = res.error || "检查更新失败";
        } else {
          status.value = "idle";
        }
        return res;
      }
      status.value = res.hasUpdate ? "available" : "up-to-date";
      return res;
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (!silent) {
        status.value = "error";
        error.value = msg;
      } else {
        status.value = "idle";
      }
      return null;
    }
  }

  /**
   * install kicks off the combined download + swap-and-restart flow.
   * Progress is delivered via runtime events with phases:
   *   - "download" + downloaded/total bytes
   *   - "applying"   (download done, helper script being spawned)
   *   - "done"       (app will exit imminently)
   *   - "error"      (download or installer failed)
   */
  async function install(): Promise<void> {
    const asset = info.value?.asset;
    if (!asset?.url) {
      status.value = "error";
      error.value = "未找到适配本平台的下载文件";
      return;
    }
    if (!canAutoInstall.value) {
      status.value = "error";
      error.value = "当前平台暂不支持应用内更新，请使用 \"前往下载页\" 手动安装";
      return;
    }
    if (status.value === "downloading" || status.value === "applying") return;

    downloadedBytes.value = 0;
    totalBytes.value = asset.size || 0;
    error.value = "";
    status.value = "downloading";

    // Subscribe before triggering so we don't miss the first chunk.
    progressOff?.();
    progressOff = subscribeProgress((payload) => {
      if (typeof payload.downloaded === "number") {
        downloadedBytes.value = payload.downloaded;
      }
      if (typeof payload.total === "number" && payload.total > 0) {
        totalBytes.value = payload.total;
      }
      switch (payload.phase) {
        case "applying":
          status.value = "applying";
          break;
        case "done":
          status.value = "applying";
          break;
        case "error":
          status.value = "error";
          error.value = payload.error || "更新失败";
          progressOff?.();
          progressOff = null;
          break;
      }
    });

    try {
      const res = await backend.downloadAndInstallUpdate({
        assetUrl: asset.url,
        assetName: asset.name,
      } as main.InstallUpdateRequest);
      if (res.error) {
        status.value = "error";
        error.value = res.error;
        progressOff?.();
        progressOff = null;
      }
    } catch (err) {
      status.value = "error";
      error.value = (err as Error)?.message || String(err);
      progressOff?.();
      progressOff = null;
    }
  }

  async function cancel(): Promise<void> {
    try {
      await backend.cancelUpdate();
    } catch {
      /* ignore */
    }
    progressOff?.();
    progressOff = null;
    if (status.value === "downloading") {
      status.value = info.value?.hasUpdate ? "available" : "idle";
      error.value = "已取消";
    }
  }

  function openReleasePage(): void {
    backend.openReleasesPage().catch(() => {});
  }

  function reset(): void {
    progressOff?.();
    progressOff = null;
    status.value = "idle";
    error.value = "";
    downloadedBytes.value = 0;
    totalBytes.value = 0;
  }

  return {
    status,
    error,
    appVersion,
    info,
    downloadedBytes,
    totalBytes,
    lastCheckMs,
    hasUpdate,
    downloadProgress,
    canAutoInstall,
    loadAppVersion,
    check,
    install,
    cancel,
    openReleasePage,
    reset,
  };
});

function subscribeProgress(fn: (payload: ProgressPayload) => void): () => void {
  const off = EventsOn(PROGRESS_EVENT, (payload: ProgressPayload) => fn(payload || {}));
  return () => {
    try {
      off?.();
    } catch {
      /* ignore */
    }
    EventsOff(PROGRESS_EVENT);
  };
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUpdateStore, import.meta.hot));
}
