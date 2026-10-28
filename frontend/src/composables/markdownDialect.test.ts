import { describe, expect, it } from "vitest";
import {
  analyzeWysiwygCompatibility,
  getMarkdownDocumentKind,
} from "./markdownDialect";

const tab = (title: string, text = "", language = "markdown") => ({
  title,
  path: title,
  text,
  language,
});

describe("Markdown document policy", () => {
  it("keeps MDX in source mode", () => {
    const document = tab("page.mdx", "export const x = 1\n\n# Page");
    expect(getMarkdownDocumentKind(document)).toBe("mdx");
    expect(analyzeWysiwygCompatibility(document).reason).toBe("mdx");
  });

  it.each([
    ["html", "# Demo\n\n<details>content</details>"],
    ["references", "[Text][docs]\n\n[docs]: ./docs.md"],
  ])("protects unsupported %s syntax", (reason, source) => {
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).reason).toBe(reason);
  });

  it("does not treat code examples as unsupported syntax", () => {
    const source = "```html\n<details>[^one]</details>\n```";
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });

  it("allows Typora-style resized <img> HTML in WYSIWYG", () => {
    const resized = '# Demo\n\n<img src="a.png" alt="a" style="width:200px" />\n';
    expect(analyzeWysiwygCompatibility(tab("demo.md", resized)).compatible).toBe(true);
    // But a non-image raw HTML tag still forces source mode.
    const other = '# Demo\n\n<div>hi</div>\n';
    expect(analyzeWysiwygCompatibility(tab("demo.md", other)).reason).toBe("html");
  });

  it("allows footnotes in WYSIWYG (GFM schema round-trips them)", () => {
    const withUsage = tab("demo.md", "A note[^one].\n\n[^one]: Detail");
    expect(analyzeWysiwygCompatibility(withUsage).compatible).toBe(true);
    // A standalone definition (no in-text reference) is also safe \u2014 it maps to
    // the GFM footnote_definition node and round-trips verbatim.
    const standalone = tab("demo.md", "[^unused]: Keep this definition");
    expect(analyzeWysiwygCompatibility(standalone).compatible).toBe(true);
  });

  it.each([
    ["UTF-8 BOM YAML", "\uFEFF---\ntitle: Demo\n---\n# Demo"],
    ["standard YAML", "---\ntitle: Demo\n---\n# Demo"],
  ])("allows %s front matter (preserved by the Milkdown adapter)", (_name, source) => {
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });

  it("protects TOML (+++) front matter", () => {
    expect(
      analyzeWysiwygCompatibility(tab("demo.md", "+++\ntitle = 'Demo'\n+++\n# Demo")).reason,
    ).toBe("frontmatter");
  });

  it("reports a source-safe alternative for protected syntax", () => {
    const result = analyzeWysiwygCompatibility(tab("demo.md", "<aside>Note</aside>"));
    expect(result.compatible).toBe(false);
    expect(result.message).toContain("源码或分栏模式");
  });

  it("protects unused reference definitions from WYSIWYG normalization", () => {
    const document = tab("demo.md", "[unused]: ./keep-this.md");
    expect(analyzeWysiwygCompatibility(document).reason).toBe("references");
  });

  it("reports the source lines that forced source mode", () => {
    const htmlDoc = tab(
      "demo.md",
      "# Demo\n\nintro paragraph\n\n<details>content</details>\n\nmore text\n",
    );
    const htmlResult = analyzeWysiwygCompatibility(htmlDoc);
    expect(htmlResult.compatible).toBe(false);
    expect(htmlResult.lines).toContain(5);
    expect(htmlResult.message).toContain("第 5 行");

    const refDoc = tab("demo.md", "# A\n\nSome [text][id].\n\n[id]: ./ref.md\n");
    const refResult = analyzeWysiwygCompatibility(refDoc);
    expect(refResult.lines).toContain(5);

    const tomlDoc = tab("demo.md", "+++\ntitle = 'Demo'\n+++\n# Demo");
    const tomlResult = analyzeWysiwygCompatibility(tomlDoc);
    expect(tomlResult.lines).toEqual([1]);
  });

  it("allows supported CommonMark and GFM documents", () => {
    const source = "# Demo\n\n- [x] complete\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });
});
