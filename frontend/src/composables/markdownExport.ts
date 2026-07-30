import katexStyles from "katex/dist/katex.min.css?inline";
import { renderDocumentMarkdown } from "./useMarkdown";
import { renderMermaidElements } from "./useMermaid";
import {
  hydrateLocalMarkdownImages,
  isRelativeMarkdownReference,
} from "./markdownResources";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

const printableKatexStyles = katexStyles.replace(
  /@font-face\s*\{[^}]*\}/gu,
  "",
);

const markdownPrintStyles = /* css */ `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
html { color-scheme: light; background: #fff; }
body {
  margin: 0;
  color: #24292f;
  background: #fff;
  font: 14px/1.72 -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.tm-markdown-export { max-width: 100%; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 {
  margin: 1.35em 0 0.6em;
  color: #1f2328;
  font-weight: 650;
  line-height: 1.3;
  break-after: avoid-page;
}
h1 { margin-top: 0; padding-bottom: 0.3em; border-bottom: 1px solid #d8dee4; font-size: 2em; }
h2 { padding-bottom: 0.25em; border-bottom: 1px solid #d8dee4; font-size: 1.55em; }
h3 { font-size: 1.28em; }
h4 { font-size: 1.1em; }
h5, h6 { font-size: 1em; }
p { margin: 0.7em 0; orphans: 3; widows: 3; }
a { color: #0969da; text-decoration: none; }
strong { font-weight: 650; }
ul, ol { margin: 0.65em 0; padding-left: 1.8em; }
li { margin: 0.2em 0; }
blockquote {
  margin: 0.9em 0;
  padding: 0.2em 0 0.2em 1em;
  color: #57606a;
  border-left: 4px solid #d0d7de;
}
code {
  padding: 0.12em 0.35em;
  border-radius: 4px;
  background: #eff1f3;
  font-family: Consolas, "Cascadia Mono", "Courier New", monospace;
  font-size: 0.9em;
}
pre {
  margin: 0.9em 0;
  padding: 12px 14px;
  overflow: hidden;
  border: 1px solid #d8dee4;
  border-radius: 6px;
  background: #f6f8fa;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  break-inside: avoid-page;
}
pre code { padding: 0; border: 0; background: transparent; }
table { width: 100%; margin: 0.9em 0; border-collapse: collapse; break-inside: avoid-page; }
th, td { padding: 6px 9px; border: 1px solid #d0d7de; text-align: left; vertical-align: top; }
th { background: #f6f8fa; font-weight: 650; }
tr:nth-child(even) td { background: #fbfcfd; }
img, svg { max-width: 100%; height: auto; break-inside: avoid-page; }
hr { margin: 1.5em 0; border: 0; border-top: 1px solid #d0d7de; }
.task-list-item { list-style: none; }
.task-list-item-checkbox { margin: 0 0.5em 0 -1.4em; }
.footnotes { margin-top: 2em; padding-top: 0.7em; border-top: 1px solid #d0d7de; color: #57606a; font-size: 0.92em; }
.tm-mermaid { margin: 1em 0; text-align: center; break-inside: avoid-page; }
.tm-mermaid[data-mermaid-state="rendered"] .tm-mermaid__source { display: none; }
.tm-mermaid__output svg { display: inline-block; }
.tm-markdown-image--missing { border: 1px dashed #cf222e; min-width: 120px; min-height: 48px; }
.hljs-comment, .hljs-quote { color: #6e7781; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #cf222e; }
.hljs-string, .hljs-title, .hljs-section { color: #0a3069; }
.hljs-number, .hljs-symbol { color: #0550ae; }
.katex-display { overflow: hidden; break-inside: avoid-page; }
.katex .katex-mathml {
  position: static !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
  clip: auto !important;
  white-space: normal !important;
}
.katex .katex-html { display: none !important; }
.katex math { font-family: "Cambria Math", "STIX Two Math", serif; }
`;

export function buildMarkdownPDFDocument(
  title: string,
  bodyHtml: string,
): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || "Markdown")}</title>
  <style>${printableKatexStyles}\n${markdownPrintStyles}</style>
</head>
<body>
  <article class="tm-markdown-export">${bodyHtml}</article>
</body>
</html>`;
}

export interface PreparedMarkdownPDF {
  html: string;
  missingLocalImages: number;
  mermaidErrors: number;
}

export async function prepareMarkdownPDF(
  source: string,
  title: string,
  documentPath: string,
): Promise<PreparedMarkdownPDF> {
  const article = document.createElement("article");
  article.innerHTML = renderDocumentMarkdown(source);
  if (!documentPath) {
    article.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
      if (isRelativeMarkdownReference(image.getAttribute("src") || "")) {
        image.classList.add("tm-markdown-image--missing");
      }
    });
  }
  await hydrateLocalMarkdownImages(article, documentPath);
  await renderMermaidElements(article, "default");
  article.querySelectorAll("a[target]").forEach((link) => {
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });
  return {
    html: buildMarkdownPDFDocument(title, article.innerHTML),
    missingLocalImages: article.querySelectorAll(
      ".tm-markdown-image--missing",
    ).length,
    mermaidErrors: article.querySelectorAll(
      '.tm-mermaid[data-mermaid-state="error"]',
    ).length,
  };
}
