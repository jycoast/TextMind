import {
  analyzeWysiwygCompatibility,
  isMarkdownDocument,
} from "@/composables/markdownDialect";
import type { Tab } from "@/types";

export const MILKDOWN_EDITOR_ID = "milkdown";
export const SPLIT_EDITOR_ID = "markdown-split";

export type MarkdownEditorMode = "wysiwyg" | "split" | "source";

export function supportsWysiwyg(tab: Tab): boolean {
  return isMarkdownDocument(tab) && analyzeWysiwygCompatibility(tab).compatible;
}

export function getCurrentMode(tab: Tab): MarkdownEditorMode {
  if (tab.editorId === SPLIT_EDITOR_ID) return "split";
  if (tab.editorId === "monaco" || !supportsWysiwyg(tab)) return "source";
  return "wysiwyg";
}

export function getNextMode(tab: Tab): MarkdownEditorMode {
  const current = getCurrentMode(tab);
  if (!supportsWysiwyg(tab)) return current === "split" ? "source" : "split";
  if (current === "wysiwyg") return "split";
  if (current === "split") return "source";
  return "wysiwyg";
}

export function editorIdForMode(mode: MarkdownEditorMode): string {
  if (mode === "wysiwyg") return MILKDOWN_EDITOR_ID;
  if (mode === "split") return SPLIT_EDITOR_ID;
  return "monaco";
}
