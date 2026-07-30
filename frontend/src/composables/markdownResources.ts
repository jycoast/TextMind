import { nextTick } from "vue";
import { backend, isBackendReady } from "@/api/backend";
import { commandRegistry } from "@/plugins/core";
import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import { parseMarkdownOutline } from "@/plugins/builtin/outline/parser";
import { slugifyMarkdownHeading } from "./useMarkdown";
import { handleMarkdownLinkClick } from "./markdownLinks";

const IMAGE_CACHE_LIMIT = 24;
const localImageCache = new Map<string, Promise<string>>();

export function isRelativeMarkdownReference(reference: string): boolean {
  const value = reference.trim();
  if (!value || value.startsWith("#") || value.startsWith("//")) return false;
  return !/^[a-z][a-z\d+.-]*:/iu.test(value);
}

function decodeFragment(value: string): string {
  const fragment = value.replace(/^#/, "");
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function findAnchor(root: ParentNode, fragment: string): HTMLElement | null {
  const id = decodeFragment(fragment);
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => element.id === id,
    ) || null
  );
}

function revealCurrentDocumentFragment(fragment: string): boolean {
  const tabs = useTabsStore();
  const tab = tabs.current;
  const adapter = tabs.adapter;
  if (!tab || !adapter) return false;
  const decoded = decodeFragment(fragment);
  const normalized = slugifyMarkdownHeading(decoded);
  const item = parseMarkdownOutline(tab.text || "").find(
    (heading) => heading.slug === decoded || heading.slug === normalized,
  );
  if (!item) return false;
  if (adapter.revealLine?.(item.line)) return true;
  return Boolean(adapter.revealNthHeading?.(item.index));
}

async function openRelativeMarkdownLink(
  documentPath: string,
  href: string,
): Promise<void> {
  const ui = useUiStore();
  if (!isBackendReady()) {
    ui.showTip("本地链接仅在桌面应用中可用");
    return;
  }
  try {
    const result = await backend.resolveMarkdownLink(documentPath, href);
    if (result.error) {
      ui.showTip(result.error);
      return;
    }
    if (result.path) {
      await commandRegistry.execute("file.openByPath", result.path);
      await nextTick();
    }
    if (result.fragment) {
      window.setTimeout(() => {
        if (!revealCurrentDocumentFragment(result.fragment)) {
          ui.showTip(`未找到标题：${decodeFragment(result.fragment)}`);
        }
      }, 0);
    }
  } catch (error) {
    ui.showTip(error instanceof Error ? error.message : "无法打开本地链接");
  }
}

/** Handles external, same-document, and relative local document links. */
export function handleDocumentMarkdownLinkClick(
  event: MouseEvent,
  root: ParentNode,
  documentPath: string,
): boolean {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href]");
  if (!link) return false;
  const href = link.getAttribute("href") || "";
  if (href.startsWith("#")) {
    const destination = findAnchor(root, href);
    event.preventDefault();
    event.stopPropagation();
    if (destination) {
      destination.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!revealCurrentDocumentFragment(href)) {
      useUiStore().showTip(`未找到标题：${decodeFragment(href)}`);
    }
    return true;
  }
  if (handleMarkdownLinkClick(event)) return true;
  if (!isRelativeMarkdownReference(href)) return false;
  event.preventDefault();
  event.stopPropagation();
  if (!documentPath) {
    useUiStore().showTip("请先保存 Markdown 文档，再打开相对链接");
    return true;
  }
  void openRelativeMarkdownLink(documentPath, href);
  return true;
}

function getLocalImageData(documentPath: string, source: string): Promise<string> {
  const key = `${documentPath}\n${source}`;
  const hit = localImageCache.get(key);
  if (hit) return hit;
  const pending = backend
    .resolveMarkdownImage(documentPath, source)
    .then((result) => {
      if (result.error || !result.dataUrl) {
        throw new Error(result.error || "无法加载本地图片");
      }
      return result.dataUrl;
    });
  localImageCache.set(key, pending);
  if (localImageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = localImageCache.keys().next().value;
    if (oldest !== undefined) localImageCache.delete(oldest);
  }
  pending.catch(() => localImageCache.delete(key));
  return pending;
}

export function resolveLocalMarkdownImageSource(
  documentPath: string,
  source: string,
): Promise<string> {
  if (!documentPath || !isRelativeMarkdownReference(source)) {
    return Promise.resolve(source);
  }
  if (!isBackendReady()) {
    return Promise.reject(new Error("本地图片仅在桌面应用中可用"));
  }
  return getLocalImageData(documentPath, source);
}

/** Replaces relative image sources with backend-provided, size-limited data URLs. */
export async function hydrateLocalMarkdownImages(
  root: ParentNode,
  documentPath: string,
): Promise<void> {
  if (!documentPath || !isBackendReady()) return;
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"));
  await Promise.all(
    images.map(async (image) => {
      if (image.dataset.tmLocalImageHydrated) return;
      const source = image.getAttribute("src") || "";
      if (!isRelativeMarkdownReference(source)) return;
      image.dataset.tmLocalImageHydrated = "loading";
      try {
        const dataUrl = await resolveLocalMarkdownImageSource(
          documentPath,
          source,
        );
        if (!root.contains(image)) return;
        image.src = dataUrl;
        image.dataset.tmLocalImageHydrated = "ready";
      } catch (error) {
        if (!root.contains(image)) return;
        image.dataset.tmLocalImageHydrated = "error";
        image.classList.add("tm-markdown-image--missing");
        image.title = error instanceof Error ? error.message : "无法加载本地图片";
      }
    }),
  );
}
