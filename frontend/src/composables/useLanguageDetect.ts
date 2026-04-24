import hljs from "highlight.js/lib/common";

const HLJS_TO_MONACO: Record<string, string> = {
  bash: "shell",
  shell: "shell",
  objectivec: "objective-c",
  vbnet: "vb",
  xml: "xml",
};

const SAMPLE_LIMIT = 64 * 1024;
const MIN_RELEVANCE = 10;

export function detectLanguageFromContent(text: string): string {
  const raw = text || "";
  const src = raw.length > SAMPLE_LIMIT ? raw.slice(0, SAMPLE_LIMIT) : raw;
  if (!src.trim()) return "";

  const trimmed = src.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // fall through to hljs
    }
  }

  const r = hljs.highlightAuto(src);
  if (!r.language || (r.relevance ?? 0) < MIN_RELEVANCE) return "";
  return HLJS_TO_MONACO[r.language] ?? r.language;
}
