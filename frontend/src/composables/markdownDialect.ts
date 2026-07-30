import MarkdownIt from "markdown-it";
import type { Tab } from "@/types";

export type MarkdownDocumentKind = "markdown" | "mdx" | "other";

export interface WysiwygCompatibility {
  compatible: boolean;
  reason: "mdx" | "frontmatter" | "html" | "footnotes" | "references" | null;
  message: string;
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

function hasFrontmatter(source: string): boolean {
  return /^(?:\uFEFF)?(?:---|\+\+\+)\s*\r?\n/.test(source);
}

function analyzeSourceFeatures(
  source: string,
): { html: boolean; footnotes: boolean; references: boolean } {
  const env: { references?: Record<string, unknown> } = {};
  const tokens = markdownSourceParser.parse(source, env);
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
  const html = tokens.some(
    (token) => token.type === "html_block" || token.type === "html_inline",
  );
  const references = Object.keys(env.references || {}).some(
    (label) => !label.startsWith("^"),
  );
  return { html, footnotes, references };
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
  if (hasFrontmatter(source)) {
    return {
      compatible: false,
      reason: "frontmatter",
      message: "检测到 Front Matter，请使用源码或分栏模式以保持元数据原样",
    };
  }
  const features = analyzeSourceFeatures(source);
  if (features.html) {
    return {
      compatible: false,
      reason: "html",
      message: "检测到原始 HTML，请使用源码或分栏模式以避免标签被改写",
    };
  }
  if (features.footnotes) {
    return {
      compatible: false,
      reason: "footnotes",
      message: "检测到脚注语法，请使用源码或分栏模式以避免引用被改写",
    };
  }
  if (features.references) {
    return {
      compatible: false,
      reason: "references",
      message: "检测到引用式链接定义，请使用源码或分栏模式以保持定义和复用关系原样",
    };
  }

  return { compatible: true, reason: null, message: "" };
}
