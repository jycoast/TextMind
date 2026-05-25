// textmind.cos-upload — intercepts image pastes in markdown tabs, uploads
// the blob to Tencent Cloud COS using the persisted credentials, then
// inserts a markdown image link at the cursor.
//
// Activation strategy: subscribe to editorRegistry.onEditorAttached so we
// hook every editor instance (Monaco + Milkdown) once it mounts. The paste
// handler is a no-op for non-markdown tabs and a no-op when COS isn't
// configured — both keep the user's normal paste behavior untouched.
//
// Configuration UI: this plugin doesn't own a top-level menu entry. It
// contributes a `SettingsPageSpec` via ctx.settings.registerPage, and the
// "插件设置..." dialog (provided by the pluginsUi plugin) hosts the panel.

import { defineAsyncComponent } from "vue";
import type { Plugin, PluginContext } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { backend } from "@/api/backend";
import type { EditorAdapter, Tab } from "@/types";

const PLUGIN_ID = "textmind.cos-upload";
const SETTINGS_PAGE_ID = "textmind.cos-upload.settings";

const COSSettingsPanel = defineAsyncComponent(() => import("./COSSettingsPanel.vue"));

function isMarkdownTab(tab: Tab | null | undefined): boolean {
  if (!tab) return false;
  if (tab.language === "markdown" || tab.language === "md") return true;
  const p = (tab.path || tab.title || "").toLowerCase();
  return /\.(md|markdown|mdx)$/.test(p);
}

// Read a Blob into a base64 string (no data: prefix).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read blob failed"));
    reader.readAsDataURL(blob);
  });
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("svg")) return "svg";
  return "png";
}

function imageItemsFromClipboard(items: DataTransferItemList | null): File[] {
  if (!items) return [];
  const out: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

function altFromName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  if (!base || base === "image") return "image";
  return base;
}

function attachPasteHandler(adapter: EditorAdapter) {
  if (typeof adapter.onPaste !== "function") return;
  if (typeof adapter.insertText !== "function") return;

  adapter.onPaste((ev) => {
    const tabs = useTabsStore();
    if (!isMarkdownTab(tabs.current)) return false;
    const files = imageItemsFromClipboard(ev.clipboardData?.items ?? null);
    if (files.length === 0) return false;

    // We're definitely handling this — return true and process async.
    void handlePastedImages(adapter, files);
    return true;
  });
}

async function handlePastedImages(adapter: EditorAdapter, files: File[]) {
  const ui = useUiStore();

  // Probe config first — if not configured, surface a single tip and stop
  // (we already swallowed the event, so the user would otherwise see no
  // feedback at all).
  let cfg: { secretId?: string; secretKey?: string; region?: string; bucket?: string } = {};
  try {
    cfg = await backend.getCOSConfig();
  } catch (err) {
    console.warn("[cos] load config:", err);
  }
  const missing: string[] = [];
  if (!cfg.secretId) missing.push("SecretID");
  if (!cfg.secretKey) missing.push("SecretKey");
  if (!cfg.region) missing.push("Region");
  if (!cfg.bucket) missing.push("Bucket");
  if (missing.length > 0) {
    ui.showTip(
      `未配置 COS：${missing.join(" / ")}，请在「设置 → 插件管理 → 腾讯云 COS 图片上传 → 设置」中填写`,
    );
    return;
  }

  for (const file of files) {
    const stamp = Date.now();
    const ext = extFromMime(file.type || "image/png");
    const filename = file.name && file.name !== "image.png"
      ? file.name
      : `paste-${stamp}.${ext}`;

    ui.showTip(`正在上传 ${filename} 到 COS…`);

    try {
      const base64 = await blobToBase64(file);
      const res = await backend.uploadImageToCOS(filename, file.type || "", base64);
      if (res?.error) {
        ui.showTip(res.error);
        continue;
      }
      if (!res?.url) {
        ui.showTip("上传成功但未返回 URL");
        continue;
      }
      const alt = altFromName(filename);
      const md = `![${alt}](${res.url})`;
      const ok = adapter.insertText?.(md);
      if (ok) {
        ui.showTip(`已上传并插入 ${filename}`);
      } else {
        ui.showTip(`上传成功：${res.url}（请手动粘贴）`);
      }
    } catch (err) {
      console.error("[cos] upload failed:", err);
      ui.showTip("上传失败：" + String(err));
    }
  }
}

export const cosUploadPlugin: Plugin = {
  manifest: {
    id: PLUGIN_ID,
    name: "腾讯云 COS 图片上传",
    version: "1.0.0",
    builtin: true,
    description:
      "在 Markdown 编辑器中粘贴图片时自动上传到腾讯云 COS，并插入图片链接。",
  },
  async activate(ctx: PluginContext) {
    // Hook every editor that mounts from now on, plus the one that may
    // already be mounted by the time we activate.
    ctx.editor.onEditorAttached((adapter) => {
      try {
        attachPasteHandler(adapter);
      } catch (err) {
        console.error("[cos] attach paste handler:", err);
      }
    });
    const tabs = useTabsStore();
    if (tabs.adapter) attachPasteHandler(tabs.adapter);

    // Expose configuration as a settings page; the "插件设置..." dialog
    // hosts the panel and shares its modal chrome with other plugins.
    ctx.settings.registerPage({
      id: SETTINGS_PAGE_ID,
      title: "腾讯云 COS 图片上传",
      order: 10,
      component: COSSettingsPanel,
    });
  },
};
