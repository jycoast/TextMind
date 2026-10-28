import { describe, expect, it } from "vitest";
import { richHtmlToMarkdown } from "./markdownRichPaste";

describe("rich HTML to Markdown", () => {
  it("converts headings, emphasis and lists", () => {
    const md = richHtmlToMarkdown(
      "<h2>Title</h2><p>Hello <strong>bold</strong> and <em>it</em></p><ul><li>a</li><li>b</li></ul>",
    );
    expect(md).toContain("## Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("*it*");
    expect(md).toMatch(/-\s+a/);
    expect(md).toMatch(/-\s+b/);
  });

  it("keeps links and their labels", () => {
    const md = richHtmlToMarkdown(
      '<p>See <a href="./docs.md">the docs</a> and <a href="https://example.com">web</a>.</p>',
    );
    expect(md).toContain("[the docs](./docs.md)");
    expect(md).toContain("[web](https://example.com)");
  });

  it("converts fenced code blocks with language", () => {
    const md = richHtmlToMarkdown(
      '<pre><code class="language-ts">const x = 1;</code></pre>',
    );
    expect(md).toContain("```ts");
    expect(md).toContain("const x = 1;");
    expect(md).toContain("```");
  });

  it("returns empty for empty or meaningless input", () => {
    expect(richHtmlToMarkdown("")).toBe("");
    expect(richHtmlToMarkdown("<div></div>")).toBe("");
  });
});
