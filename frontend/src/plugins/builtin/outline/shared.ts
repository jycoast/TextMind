// Shared constants + jump helper used by both the plugin entry (index.ts)
// and the panel component (OutlinePanel.vue).

import { useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui";
import type { Tab } from "@/types";
import type { OutlineItem } from "./parser";

export const PLUGIN_ID = "textmind.outline";
export const PANEL_ID = "textmind.outline.panel";

export function isMarkdownTab(tab: Tab | null | undefined): boolean {
  if (!tab) return false;
  if (tab.language === "markdown" || tab.language === "md") return true;
  const p = (tab.path || tab.title || "").toLowerCase();
  return /\.(md|markdown|mdx)$/.test(p);
}

/**
 * Jump to an outline item using whichever scheme the current adapter
 * supports: revealLine (Monaco) takes priority, falling back to
 * revealNthHeading (Milkdown). Surfaces a tip on the rare case neither
 * succeeded so the user gets feedback instead of a silent click.
 */
export function jumpToOutlineItem(item: OutlineItem): void {
  const tabs = useTabsStore();
  const adapter = tabs.adapter;
  if (!adapter) return;

  if (typeof adapter.revealLine === "function") {
    if (adapter.revealLine(item.line)) return;
  }
  if (typeof adapter.revealNthHeading === "function") {
    if (adapter.revealNthHeading(item.index)) return;
  }
  useUiStore().showTip("当前编辑器不支持跳转");
}
