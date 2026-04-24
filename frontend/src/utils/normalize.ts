import type { MonacoViewState, RecentFile } from "@/types";

export function normalizeLanguage(language: unknown): string {
  if (typeof language !== "string") return "plaintext";
  return language.trim().toLowerCase() || "plaintext";
}

export function normalizeViewState(
  viewState: unknown,
): MonacoViewState | null {
  if (!viewState || typeof viewState !== "object") return null;
  const v = viewState as Partial<MonacoViewState>;
  const n: MonacoViewState = {
    scrollTop: Number(v.scrollTop) || 0,
    scrollLeft: Number(v.scrollLeft) || 0,
  };
  if (
    Number.isFinite(v.selectionStart) &&
    Number.isFinite(v.selectionEnd)
  ) {
    n.selectionStart = Math.max(0, Number(v.selectionStart));
    n.selectionEnd = Math.max(0, Number(v.selectionEnd));
  }
  if (
    Number.isFinite(v.startLineNumber) &&
    Number.isFinite(v.startColumn) &&
    Number.isFinite(v.endLineNumber) &&
    Number.isFinite(v.endColumn)
  ) {
    n.startLineNumber = Math.max(1, Number(v.startLineNumber));
    n.startColumn = Math.max(1, Number(v.startColumn));
    n.endLineNumber = Math.max(1, Number(v.endLineNumber));
    n.endColumn = Math.max(1, Number(v.endColumn));
  }
  return n;
}

export function normalizeRecentFile(item: unknown): RecentFile | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<RecentFile>;
  const path = String(raw.path || "").trim();
  if (!path) return null;
  return {
    path,
    name: String(raw.name || "").trim() || path,
    language: normalizeLanguage(raw.language),
  };
}

export function normalizePathKey(path: string): string {
  return String(path || "")
    .trim()
    .replace(/[\\/]+/g, "\\")
    .toLowerCase();
}

export function pathBaseName(path: string): string {
  const parts = String(path || "")
    .replace(/[\\/]+/g, "/")
    .split("/")
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}
