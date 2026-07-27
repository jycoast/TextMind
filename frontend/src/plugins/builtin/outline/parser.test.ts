import { describe, expect, it } from "vitest";
import { parseMarkdownOutline } from "./parser";

describe("parseMarkdownOutline", () => {
  it("supports ATX and Setext headings with source lines", () => {
    const outline = parseMarkdownOutline("# One\n\nTwo\n---\n\n### Three");
    expect(outline).toEqual([
      { level: 1, text: "One", line: 1, index: 0 },
      { level: 2, text: "Two", line: 3, index: 1 },
      { level: 3, text: "Three", line: 6, index: 2 },
    ]);
  });

  it("returns readable labels for formatted headings", () => {
    const outline = parseMarkdownOutline("## **Bold** and [link](https://example.com) `code`");
    expect(outline[0]?.text).toBe("Bold and link code");
  });

  it("obeys CommonMark fence lengths", () => {
    const source = "````md\n# Not a heading\n```\nStill code\n````\n# Real heading";
    expect(parseMarkdownOutline(source).map((item) => item.text)).toEqual([
      "Real heading",
    ]);
  });
});
