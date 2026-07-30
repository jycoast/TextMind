import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import katexPlugin from "@vscode/markdown-it-katex";
import footnotePlugin from "markdown-it-footnote";
import frontMatterPlugin from "markdown-it-front-matter";
import Token from "markdown-it/lib/token.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

const CACHE_LIMIT = 200;
const MAX_CACHE_SOURCE_LENGTH = 100_000;
const renderCache = new Map<string, string>();
let fullMarkdown: MarkdownIt | null = null;
let documentMarkdown: MarkdownIt | null = null;
let streamingMarkdown: MarkdownIt | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function configureSafeRenderer(md: MarkdownIt): void {
  const fallback = md.renderer.renderToken.bind(md.renderer);
  const originalLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href") || "";
    if (/^(https?:|mailto:)/iu.test(href)) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noopener noreferrer");
    }
    return originalLinkOpen
      ? originalLinkOpen(tokens, index, options, env, self)
      : fallback(tokens, index, options);
  };

  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    tokens[index].attrSet("loading", "lazy");
    tokens[index].attrSet("referrerpolicy", "no-referrer");
    return originalImage
      ? originalImage(tokens, index, options, env, self)
      : fallback(tokens, index, options);
  };
}

function configureTaskLists(md: MarkdownIt): void {
  md.core.ruler.after("inline", "textmind_task_lists", (state) => {
    const listItems: number[] = [];
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type === "list_item_open") {
        listItems.push(index);
        continue;
      }
      if (token.type === "list_item_close") {
        listItems.pop();
        continue;
      }
      if (token.type !== "inline" || listItems.length === 0) continue;
      const children = token.children || [];
      const textIndex = children.findIndex((child) => child.type === "text");
      if (textIndex < 0) continue;
      const text = children[textIndex];
      const match = /^\[([ xX])\]\s+/.exec(text.content);
      if (!match) continue;

      text.content = text.content.slice(match[0].length);
      const checkbox = new Token("html_inline", "", 0);
      const checked = match[1].toLowerCase() === "x" ? " checked" : "";
      checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${checked}> `;
      children.splice(textIndex, 0, checkbox);
      state.tokens[listItems[listItems.length - 1]].attrJoin(
        "class",
        "task-list-item",
      );
    }
  });
}

function headingInlineText(token: Token | undefined): string {
  if (!token?.children?.length) return token?.content || "";
  return token.children
    .map((child) => {
      if (child.type === "image") {
        return child.content || child.attrGet("alt") || "";
      }
      if (child.type === "softbreak" || child.type === "hardbreak") return " ";
      return child.type === "html_inline" ? "" : child.content || "";
    })
    .join("");
}

/** GitHub-like, Unicode-safe heading slug shared by preview and outline. */
export function slugifyMarkdownHeading(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s+/gu, "-");
  return slug || "section";
}

function configureHeadingAnchors(md: MarkdownIt): void {
  md.core.ruler.after("inline", "textmind_heading_anchors", (state) => {
    const counts = new Map<string, number>();
    for (let index = 0; index < state.tokens.length; index += 1) {
      const open = state.tokens[index];
      if (open.type !== "heading_open") continue;
      const base = slugifyMarkdownHeading(
        headingInlineText(state.tokens[index + 1]),
      );
      const duplicate = counts.get(base) || 0;
      counts.set(base, duplicate + 1);
      const slug = duplicate === 0 ? base : `${base}-${duplicate}`;
      open.attrSet("id", slug);
      open.meta = { ...(open.meta || {}), textmindSlug: slug };
    }
  });
}

function configureSourceLineAnchors(md: MarkdownIt): void {
  md.core.ruler.after("block", "textmind_source_lines", (state) => {
    for (const token of state.tokens) {
      if (!token.map || token.map.length < 1) continue;
      // Opening block tokens render attributes naturally. Atomic blocks such
      // as fences need dedicated renderers and continue using proportional
      // scroll as a fallback.
      if (token.nesting !== 1) continue;
      token.attrSet("data-source-line", String(token.map[0] + 1));
    }
  });
}

function configureTomlFrontMatter(md: MarkdownIt): void {
  md.block.ruler.before(
    "fence",
    "textmind_toml_front_matter",
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      if (startLine !== 0) return false;
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const end = state.eMarks[startLine];
      if (state.src.slice(start, end).trim() !== "+++") return false;
      if (silent) return true;
      let nextLine = startLine + 1;
      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        if (state.src.slice(lineStart, lineEnd).trim() === "+++") {
          nextLine += 1;
          break;
        }
        nextLine += 1;
      }
      const token = state.push("front_matter", "", 0);
      token.hidden = true;
      token.block = true;
      token.map = [startLine, nextLine];
      state.line = nextLine;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
}

function configureMermaidRenderer(md: MarkdownIt): void {
  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/u, 1)[0]?.toLowerCase();
    if (language !== "mermaid") {
      return originalFence
        ? originalFence(tokens, index, options, env, self)
        : self.renderToken(tokens, index, options);
    }
    const source = escapeHtml(token.content);
    return `<div class="tm-mermaid" data-mermaid-state="pending"><pre class="tm-mermaid__source">${source}</pre><div class="tm-mermaid__output" aria-label="Mermaid diagram"></div></div>`;
  };
}

function createMarkdown(
  autoHighlight: boolean,
  enableMermaid: boolean,
  breaks: boolean,
  sourceLines = false,
): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks,
    typographer: false,
    highlight(code: string, lang: string): string {
      const language = (lang || "").trim();
      try {
        if (language && hljs.getLanguage(language)) {
          const out = hljs.highlight(code, {
            language,
            ignoreIllegals: true,
          }).value;
          const safeLanguage = escapeHtml(language);
          return `<pre class="hljs"><code class="hljs language-${safeLanguage}">${out}</code></pre>`;
        }
        if (autoHighlight) {
          const auto = hljs.highlightAuto(code).value;
          return `<pre class="hljs"><code class="hljs">${auto}</code></pre>`;
        }
      } catch {
        // Fall through to escaped plain code.
      }
      const escaped = escapeHtml(code);
      return `<pre class="hljs"><code class="hljs">${escaped}</code></pre>`;
    },
  });
  md.use(katexPlugin, {
    throwOnError: false,
    enableFencedBlocks: true,
    enableMathBlockInHtml: true,
    enableMathInlineInHtml: true,
  });
  md.use(footnotePlugin);
  md.use(frontMatterPlugin, () => {});
  configureTomlFrontMatter(md);
  configureTaskLists(md);
  configureHeadingAnchors(md);
  if (sourceLines) configureSourceLineAnchors(md);
  if (enableMermaid) configureMermaidRenderer(md);
  configureSafeRenderer(md);
  return md;
}

/** Shared CommonMark/GFM-like renderer used by chat, release notes and outline. */
export function getMarkdown(): MarkdownIt {
  if (!fullMarkdown) fullMarkdown = createMarkdown(true, true, true);
  return fullMarkdown;
}

export function renderMarkdown(text: string): string {
  return text ? getMarkdown().render(text) : "";
}

/** Document preview favors portable CommonMark and predictable live cost. */
export function renderDocumentMarkdown(text: string): string {
  if (!text) return "";
  if (!documentMarkdown) documentMarkdown = createMarkdown(false, true, false, true);
  return documentMarkdown.render(text);
}

/** Render immutable messages without repeating parsing and syntax highlighting. */
export function renderMarkdownCached(text: string): string {
  if (!text) return "";
  if (text.length > MAX_CACHE_SOURCE_LENGTH) return renderMarkdown(text);
  const hit = renderCache.get(text);
  if (hit !== undefined) {
    renderCache.delete(text);
    renderCache.set(text, hit);
    return hit;
  }
  const rendered = renderMarkdown(text);
  renderCache.set(text, rendered);
  if (renderCache.size > CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return rendered;
}

/** Streaming output skips expensive language auto-detection until completion. */
export function renderStreamingMarkdown(text: string): string {
  if (!text) return "";
  if (!streamingMarkdown) streamingMarkdown = createMarkdown(false, false, true);
  return streamingMarkdown.render(text);
}
