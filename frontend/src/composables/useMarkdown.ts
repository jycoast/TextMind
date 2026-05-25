import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import katexPlugin from "@vscode/markdown-it-katex";

let cached: MarkdownIt | null = null;

/** Returns a singleton markdown-it instance with highlight.js syntax highlighting
 *  and KaTeX math rendering (inline `$...$` and block `$$...$$`). */
export function getMarkdown(): MarkdownIt {
  if (cached) return cached;
  cached = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
    highlight(code: string, lang: string) {
      const language = (lang || "").trim();
      try {
        if (language && hljs.getLanguage(language)) {
          const out = hljs.highlight(code, {
            language,
            ignoreIllegals: true,
          }).value;
          return `<pre class="hljs"><code class="hljs language-${language}">${out}</code></pre>`;
        }
        const auto = hljs.highlightAuto(code).value;
        return `<pre class="hljs"><code class="hljs">${auto}</code></pre>`;
      } catch {
        const escaped = code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<pre class="hljs"><code class="hljs">${escaped}</code></pre>`;
      }
    },
  });
  // throwOnError=false renders broken formulas as red error text instead of
  // crashing the whole markdown render pipeline (which would blank out a chat
  // message). enableFencedBlocks also makes ```math ... ``` render via KaTeX,
  // which is what most LLMs emit.
  cached.use(katexPlugin, {
    throwOnError: false,
    enableFencedBlocks: true,
    enableMathBlockInHtml: true,
    enableMathInlineInHtml: true,
  });
  return cached;
}

export function renderMarkdown(text: string): string {
  if (!text) return "";
  return getMarkdown().render(text);
}
