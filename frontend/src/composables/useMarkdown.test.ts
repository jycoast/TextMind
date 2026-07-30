import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  renderMarkdownCached,
  renderDocumentMarkdown,
  renderStreamingMarkdown,
} from "./useMarkdown";

describe("Markdown rendering", () => {
  it("disables raw HTML", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("adds safe external-link attributes", () => {
    const html = renderMarkdown("[Open](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps relative document links inside the application", () => {
    const html = renderDocumentMarkdown("[Next](./next.md)");
    expect(html).toContain('href="./next.md"');
    expect(html).not.toContain('target="_blank"');
  });

  it("adds private lazy-loading image attributes", () => {
    const html = renderMarkdown("![Alt](https://example.com/image.png)");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it("rejects unsafe URL protocols", () => {
    expect(renderMarkdown("[Bad](javascript:alert(1))")).not.toContain('href="javascript:');
  });

  it("escapes code during low-cost streaming rendering", () => {
    const html = renderStreamingMarkdown("```unknown\n<script>\n```");
    expect(html).toContain("&lt;script&gt;");
  });

  it("returns stable cached output", () => {
    expect(renderMarkdownCached("**same**")).toBe(renderMarkdownCached("**same**"));
  });

  it("emits an asynchronously hydrated Mermaid container", () => {
    const html = renderMarkdown("```mermaid\ngraph TD\nA-->B\n```");
    expect(html).toContain('class="tm-mermaid"');
    expect(html).toContain('data-mermaid-state="pending"');
    expect(html).toContain("graph TD");
    expect(html).not.toContain("language-mermaid");
  });

  it("renders GFM task list checkboxes", () => {
    const html = renderMarkdown("- [x] done\n- [ ] pending");
    expect(html).toContain("task-list-item-checkbox");
    expect(html).toContain("checked");
    expect(html).not.toContain("[x]");
  });

  it("renders footnotes with same-document anchors", () => {
    const html = renderMarkdown("Note[^one].\n\n[^one]: Detail");
    expect(html).toContain("footnote-ref");
    expect(html).toContain("footnotes");
    expect(html).not.toContain('href="#fn1" target="_blank"');
  });

  it("consumes front matter instead of rendering it as a heading", () => {
    const html = renderMarkdown("---\ntitle: Demo\n---\n# Body");
    expect(html).toContain('<h1 id="body">Body</h1>');
    expect(html).not.toContain("title: Demo");
  });

  it("consumes TOML front matter", () => {
    const html = renderMarkdown("+++\ntitle = \"Demo\"\n+++\n# Body");
    expect(html).toContain('<h1 id="body">Body</h1>');
    expect(html).not.toContain("title =");
  });

  it("adds stable Unicode heading anchors and de-duplicates them", () => {
    const html = renderDocumentMarkdown("# 中文标题\n\n## 中文标题");
    expect(html).toMatch(/<h1[^>]*id="中文标题"/);
    expect(html).toMatch(/<h2[^>]*id="中文标题-1"/);
  });

  it("keeps soft line breaks portable in document previews", () => {
    expect(renderDocumentMarkdown("first\nsecond")).not.toContain("<br>");
    expect(renderMarkdown("first\nsecond")).toContain("<br>");
  });

  it("adds source line anchors to document preview blocks", () => {
    const html = renderDocumentMarkdown("# Heading\n\nParagraph\n\n- item");
    expect(html).toContain('data-source-line="1"');
    expect(html).toContain('data-source-line="3"');
    expect(html).toContain('data-source-line="5"');
  });
});
