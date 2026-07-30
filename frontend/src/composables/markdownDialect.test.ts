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
    ["frontmatter", "---\ntitle: Demo\n---\n# Demo"],
    ["html", "# Demo\n\n<details>content</details>"],
    ["footnotes", "A note[^one].\n\n[^one]: Detail"],
    ["references", "[Text][docs]\n\n[docs]: ./docs.md"],
  ])("protects unsupported %s syntax", (reason, source) => {
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).reason).toBe(reason);
  });

  it("does not treat code examples as unsupported syntax", () => {
    const source = "```html\n<details>[^one]</details>\n```";
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });

  it("protects standalone footnote definitions", () => {
    const document = tab("demo.md", "[^unused]: Keep this definition");
    expect(analyzeWysiwygCompatibility(document).reason).toBe("footnotes");
  });

  it.each([
    ["UTF-8 BOM YAML", "\uFEFF---\ntitle: Demo\n---\n# Demo"],
    ["TOML", "+++\ntitle = 'Demo'\n+++\n# Demo"],
  ])("protects %s front matter", (_name, source) => {
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).reason).toBe("frontmatter");
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

  it("allows supported CommonMark and GFM documents", () => {
    const source = "# Demo\n\n- [x] complete\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });
});
