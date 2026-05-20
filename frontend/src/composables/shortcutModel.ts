// shortcutModel.ts
//
// Centralised registry of customizable keyboard actions plus parsing /
// stringifying / event-matching helpers for key combos.
//
// Combo string canonical form: "Ctrl+Alt+Shift+<KEY>" where <KEY> is the
// physical-ish key produced by `KeyboardEvent.key`, normalized to uppercase
// for single letters and digits, preserved verbatim for named keys ("Enter",
// "F2", "ArrowLeft", ...). An empty string means "no binding".

export type ActionId =
  | "file.save"
  | "file.openFile"
  | "file.openFolder"
  | "edit.toggleColumn"
  | "edit.templateSql"
  | "edit.detectLanguage"
  | "text.extract"
  | "text.dedupe"
  | "text.singleton"
  | "text.duplicates"
  | "text.inlist"
  | "json.format"
  | "json.minify"
  | "ai.insertSelection"
  | "ai.togglePanel";

export interface ActionMeta {
  label: string;
  defaultBinding: string;
}

export const ACTION_META: Record<ActionId, ActionMeta> = {
  "file.save": { label: "保存", defaultBinding: "Ctrl+S" },
  "file.openFile": { label: "打开文件", defaultBinding: "" },
  "file.openFolder": { label: "打开文件夹", defaultBinding: "" },
  "edit.toggleColumn": { label: "列编辑", defaultBinding: "Ctrl+Alt+L" },
  "edit.templateSql": { label: "模板批量生成", defaultBinding: "Ctrl+Shift+G" },
  "edit.detectLanguage": { label: "自动识别语言", defaultBinding: "" },
  "text.extract": { label: "提取文本", defaultBinding: "" },
  "text.dedupe": { label: "去重", defaultBinding: "" },
  "text.singleton": { label: "保留单次出现项", defaultBinding: "" },
  "text.duplicates": { label: "保留重复项", defaultBinding: "" },
  "text.inlist": { label: "转 IN 列表", defaultBinding: "" },
  "json.format": { label: "格式化 JSON", defaultBinding: "" },
  "json.minify": { label: "压缩 JSON", defaultBinding: "" },
  "ai.insertSelection": { label: "插入选中文本到 AI 对话框", defaultBinding: "" },
  "ai.togglePanel": { label: "切换 AI 面板", defaultBinding: "Ctrl+L" },
};

export const ALL_ACTION_IDS: ActionId[] = Object.keys(ACTION_META) as ActionId[];

export interface KeyCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const MODIFIER_ONLY_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "AltGraph",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Dead",
]);

function normalizeKey(rawKey: string): string {
  if (!rawKey) return "";
  if (rawKey === " ") return "Space";
  if (rawKey.length === 1) return rawKey.toUpperCase();
  return rawKey;
}

function keysEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** Stringify a combo into the canonical "Ctrl+Alt+Shift+KEY" form. */
export function stringifyCombo(combo: KeyCombo): string {
  if (!combo.key) return "";
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(normalizeKey(combo.key));
  return parts.join("+");
}

/** Parse a canonical combo string back into a KeyCombo, or null when invalid. */
export function parseCombo(text: string): KeyCombo | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const segments = trimmed.split("+").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  const combo: KeyCombo = { ctrl: false, shift: false, alt: false, key: "" };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const lower = seg.toLowerCase();
    if (i < segments.length - 1) {
      if (lower === "ctrl" || lower === "control") combo.ctrl = true;
      else if (lower === "shift") combo.shift = true;
      else if (lower === "alt") combo.alt = true;
      else return null;
    } else {
      combo.key = normalizeKey(seg);
    }
  }
  if (!combo.key) return null;
  return combo;
}

/**
 * Build a KeyCombo from a KeyboardEvent. Returns null when:
 * - the press is part of an IME composition (`ev.isComposing` or `keyCode 229`)
 * - the press is a bare modifier key (Ctrl alone, etc.)
 * - the press has no useful key
 */
export function comboFromEvent(ev: KeyboardEvent): KeyCombo | null {
  if (ev.isComposing || ev.keyCode === 229) return null;
  const rawKey = ev.key || "";
  if (!rawKey) return null;
  if (MODIFIER_ONLY_KEYS.has(rawKey)) return null;
  return {
    ctrl: ev.ctrlKey,
    shift: ev.shiftKey,
    alt: ev.altKey,
    key: normalizeKey(rawKey),
  };
}

/** True when the KeyboardEvent exactly matches the given combo. */
export function matchesCombo(ev: KeyboardEvent, combo: KeyCombo): boolean {
  if (ev.isComposing || ev.keyCode === 229) return false;
  if (ev.ctrlKey !== combo.ctrl) return false;
  if (ev.shiftKey !== combo.shift) return false;
  if (ev.altKey !== combo.alt) return false;
  if (ev.metaKey) return false;
  const evKey = normalizeKey(ev.key || "");
  return keysEqual(evKey, combo.key);
}

/** Convenience: build the defaults map keyed by ActionId. */
export function buildDefaultBindings(): Record<ActionId, string> {
  const out = {} as Record<ActionId, string>;
  for (const id of ALL_ACTION_IDS) {
    out[id] = ACTION_META[id].defaultBinding;
  }
  return out;
}
