import { describe, expect, it } from "vitest";
import { tabularTextToMarkdown } from "./tabularPaste";

describe("tabular clipboard conversion", () => {
  it("converts Excel-style TSV to a GFM table", () => {
    expect(tabularTextToMarkdown("Name\tScore\r\nAlice\t10\r\nBob\t9\r\n")).toBe(
      "| Name | Score |\n| --- | --- |\n| Alice | 10 |\n| Bob | 9 |",
    );
  });

  it("pads ragged rows and escapes Markdown cells", () => {
    expect(tabularTextToMarkdown("A\tB\nleft|right\tpath\\file\textra")).toBe(
      "| A | B |  |\n| --- | --- | --- |\n| left\\|right | path\\\\file | extra |",
    );
  });

  it("leaves ordinary text and single-line indentation alone", () => {
    expect(tabularTextToMarkdown("plain text")).toBeNull();
    expect(tabularTextToMarkdown("one\ttwo")).toBeNull();
  });
});
