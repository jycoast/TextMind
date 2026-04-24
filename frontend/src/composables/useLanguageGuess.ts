import { detectLanguageFromContent } from "./useLanguageDetect";

const extensionMap: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  jsx: "javascript",
  tsx: "typescript",
  json: "json",
  sql: "sql",
  py: "python",
  go: "go",
  java: "java",
  c: "c",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  ps1: "powershell",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  ini: "ini",
  toml: "ini",
  txt: "plaintext",
  log: "plaintext",
  csv: "plaintext",
};

export function guessLanguageByFilename(name: string | undefined): string {
  const filename = String(name || "").toLowerCase();
  const m = filename.match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : "";
  return extensionMap[ext] || "plaintext";
}

export function guessLanguage(
  name: string | undefined,
  content: string,
): string {
  const byName = guessLanguageByFilename(name);
  if (byName !== "plaintext") return byName;
  return detectLanguageFromContent(content) || "plaintext";
}
