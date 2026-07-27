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

  it("allows supported CommonMark and GFM documents", () => {
    const source = "# Demo\n\n- [x] complete\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    expect(analyzeWysiwygCompatibility(tab("demo.md", source)).compatible).toBe(true);
  });
});
