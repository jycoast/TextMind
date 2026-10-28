import MarkdownIt from "markdown-it";
import type { Tab } from "@/types";

export type MarkdownDocumentKind = "markdown" | "mdx" | "other";

export interface WysiwygCompatibility {
  compatible: boolean;
  reason: "mdx" | "frontmatter" | "html" | "footnotes" | "references" | null;
  message: string;
  /** 1-based source lines that forced source mode, when locatable. */
  lines?: number[];
}

const markdownSourceParser = new MarkdownIt({ html: true });

export function getMarkdownDocumentKind(
  tab: Pick<Tab, "language" | "path" | "title"> | null | undefined,
): MarkdownDocumentKind {
  if (!tab) return "other";
  const name = (tab.path || tab.title || "").toLowerCase();
  if (/\.mdx$/.test(name)) return "mdx";
  if (/\.(md|markdown)$/.test(name)) return "markdown";
  if (tab.language === "markdown" || tab.language === "md") return "markdown";
  return "other";
}

export function isMarkdownDocument(
  tab: Pick<Tab, "language" | "path" | "title"> | null | undefined,
): boolean {
  return getMarkdownDocumentKind(tab) !== "other";
}

// `+++`-delimited front matter is NOT preserved by the Milkdown adapter - it
// only recognizes the standard `---` YAML block (see markdownFrontMatter.ts).
// A `+++` block would be handed to remark as body content and mangled, so it
// must stay in source / split mode. The `---` form is compatible because the
// adapter strips it out of the editable doc and re-prefixes it on save.
function hasUnsupportedFrontmatter(source: string): boolean {
  return /^(?:\uFEFF)?\+\+\+\s*\r?\n/.test(source);
}

/** First 1-based line number containing the needle (or the whole match). */
function locateLine(source: string, pattern: RegExp): number | undefined {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      pattern.lastIndex = 0;
      return i + 1;
    }
    pattern.lastIndex = 0;
  }
  return undefined;
}

function analyzeSourceFeatures(
  source: string,
): { html: boolean; footnotes: boolean; references: boolean; lines: number[] } {
  const env: { references?: Record<string, unknown> } = {};
  const tokens = markdownSourceParser.parse(source, env);
  const lines = new Set<number>();
  const tokenLine = (token: unknown): number | undefined => {
    const map = (token as { map?: number[] }).map;
    return map && map.length ? map[0] + 1 : undefined;
  };
  const footnotes =
    Object.keys(env.references || {}).some((label) => label.startsWith("^")) ||
    tokens.some((token) => {
      if (token.type !== "inline") return false;
      const children = token.children || [];
      const parsedAsReferenceLink = children.some(
        (child, index) =>
          child.type === "text" &&
          child.content.startsWith("^") &&
          children[index - 1]?.type === "link_open",
      );
      if (parsedAsReferenceLink) return true;
      const plainText = children
        .filter((child) => child.type === "text")
        .map((child) => child.content)
        .join("");
      return /\[\^[^\]\r\n]+\](?=:|[^\w]|$)/.test(plainText);
    });
  // Typora-style resized images are raw `<img ...>` HTML. Those are compatible
  // (the Milkdown adapter re-parses them back into editable image nodes), so a
  // standalone img tag must not force source mode — but any OTHER raw HTML
  // still does.
  const isStandaloneImg = (content: string): boolean =>
    /^<img\b[\s\S]*?\/?>\s*$/i.test(content.trim());
  let html = false;
  for (const token of tokens) {
    if (token.type !== "html_block" && token.type !== "html_inline") continue;
    if (isStandaloneImg(token.content || "")) continue;
    html = true;
    const line = tokenLine(token);
    if (line) lines.add(line);
  }
  const referenceLabels = Object.keys(env.references || {}).filter(
    (label) => !label.startsWith("^"),
  );
  const references = referenceLabels.length > 0;
  if (references) {
    for (const label of referenceLabels) {
      const line = locateLine(
        source,
        new RegExp(`^\\s*\\[${escapeRegex(label)}\\]\\s*:`, "i"),
      );
      if (line) lines.add(line);
    }
  }
  return { html, footnotes, references, lines: [...lines].sort((a, b) => a - b) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Milkdown serializes its ProseMirror document back to Markdown. Syntax that
 * has no schema node must stay in source mode or it can be rewritten/lost.
 */
export function analyzeWysiwygCompatibility(
  tab: Pick<Tab, "language" | "path" | "title" | "text">,
): WysiwygCompatibility {
  if (getMarkdownDocumentKind(tab) === "mdx") {
    return {
      compatible: false,
      reason: "mdx",
      message: "MDX 包含 JSX/ESM 语法，请使用源码或分栏模式以避免内容丢失",
    };
  }

  const source = tab.text || "";
  // Standard `---` YAML front matter is compatible: the Milkdown adapter
  // strips it out of the editable doc and preserves it verbatim (see
  // markdownFrontMatter.ts). Only the unsupported `+++` form forces source mode.
  if (hasUnsupportedFrontmatter(source)) {
    return {
      compatible: false,
      reason: "frontmatter",
      message: "检测到 +++ 格式 Front Matter（第 1 行），请使用源码或分栏模式以保持元数据原样",
      lines: [1],
    };
  }
  const features = analyzeSourceFeatures(source);
  if (features.html) {
    const where = features.lines.length
      ? `（第 ${features.lines.join("、")} 行）`
      : "";
    return {
      compatible: false,
      reason: "html",
      message: `检测到原始 HTML${where}，请使用源码或分栏模式以避免标签被改写`,
      lines: features.lines,
    };
  }
  // Footnotes are WYSIWYG-safe: Milkdown's GFM preset ships footnote reference
  // and definition schema nodes and round-trips `[^1]` / `[^1]: ...` verbatim
  // (verified via the round-trip harness), so they no longer force source mode.
  if (features.references) {
    const where = features.lines.length
      ? `（第 ${features.lines.join("、")} 行）`
      : "";
    return {
      compatible: false,
      reason: "references",
      message: `检测到引用式链接定义${where}，请使用源码或分栏模式以保持定义和复用关系原样`,
      lines: features.lines,
    };
  }

  return { compatible: true, reason: null, message: "" };
}
