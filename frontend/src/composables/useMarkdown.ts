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

// --- Resized-image <img> HTML support --------------------------------------
// The WYSIWYG editor persists a resized image as inline raw HTML carrying the
// size in its style, Typora-style:
//
//   <img src="a.png" alt="alt" style="width:200px" />
//
// This renderer is built with `html:false`, so that tag arrives as a literal
// `text` token and would otherwise be shown escaped. These helpers mirror the
// attr/width extraction in plugins/builtin/editorMarkdown/imageResize.ts so the
// preview/export pipeline can turn it back into a real <img> with a width.

function attrValue(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function styleWidth(style: string): string | null {
  const match = style.match(/width\s*:\s*([0-9.]+)\s*px/i);
  return match ? match[1] : null;
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

type InlinePart =
  | { type: "text"; content: string }
  | { type: "img"; src: string; alt: string; title: string; width: string };

/** Split a text token's content on resized `<img>` tags into parts. */
function splitResizedImageText(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  // A tag whose attributes may contain `>` inside quoted values.
  const re = /<img\b(?:[^>"']+|"[^"]*"|'[^']*')*>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = re.exec(text))) {
    const tag = match[0];
    const width = styleWidth(attrValue(tag, "style") || "");
    if (!width) continue;
    found = true;
    if (match.index > last) {
      out.push({ type: "text", content: text.slice(last, match.index) });
    }
    out.push({
      type: "img",
      src: unescapeAttr(attrValue(tag, "src")),
      alt: unescapeAttr(attrValue(tag, "alt")),
      title: unescapeAttr(attrValue(tag, "title")),
      width,
    });
    last = re.lastIndex;
  }
  if (!found) return [{ type: "text", content: text }];
  if (last < text.length) out.push({ type: "text", content: text.slice(last) });
  return out;
}

/** Wrap block tables in a horizontally scrollable container so wide tables
 *  do not blow out a narrow preview / export pane. */
function configureTableScroll(md: MarkdownIt): void {
  md.core.ruler.after("block", "textmind_table_scroll", (state) => {
    for (let i = 0; i < state.tokens.length; i += 1) {
      if (state.tokens[i].type !== "table_open") continue;
      const open = new Token("tm_table_scroll_open", "", 0);
      state.tokens.splice(i, 0, open);
      let depth = 1;
      for (let j = i + 1; j < state.tokens.length; j += 1) {
        if (state.tokens[j].type === "table_open") depth += 1;
        else if (state.tokens[j].type === "table_close") {
          depth -= 1;
          if (depth === 0) {
            const close = new Token("tm_table_scroll_close", "", 0);
            state.tokens.splice(j + 1, 0, close);
            break;
          }
        }
      }
      i += 1;
    }
  });
  md.renderer.rules.tm_table_scroll_open = () => '<div class="tm-table-scroll">';
  md.renderer.rules.tm_table_scroll_close = () => "</div>";
}

/** Rebuild resized `<img style="width:Npx">` raw-HTML into real image tokens. */
function configureResizedImages(md: MarkdownIt): void {
  md.core.ruler.after("inline", "textmind_resized_images", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      const next: Token[] = [];
      for (const child of token.children) {
        if (child.type !== "text") {
          next.push(child);
          continue;
        }
        const parts = splitResizedImageText(child.content);
        const changed = parts.length > 1 || parts[0]?.type === "img";
        if (!changed) {
          next.push(child);
          continue;
        }
        for (const part of parts) {
          if (part.type === "text") {
            const textToken = new Token("text", "", 0);
            textToken.content = part.content;
            next.push(textToken);
          } else {
            const img = new Token("image", "img", 0);
            img.attrSet("src", part.src);
            img.attrSet("alt", part.alt);
            if (part.title) img.attrSet("title", part.title);
            img.content = part.alt;
            img.attrSet("style", `width:${part.width}px`);
            next.push(img);
          }
        }
      }
      token.children = next;
    }
  });
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

  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const style = token.attrGet("style");
    const src = escapeHtml(token.attrGet("src") || "");
    const alt = escapeHtml(token.content || "");
    const title = escapeHtml(token.attrGet("title") || "");
    let tag = `<img src="${src}" alt="${alt}"`;
    if (style) tag += ` style="${escapeHtml(style)}"`;
    if (title) tag += ` title="${title}"`;
    tag += ` loading="lazy" referrerpolicy="no-referrer">`;
    return tag;
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
  configureResizedImages(md);
  configureTableScroll(md);
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
