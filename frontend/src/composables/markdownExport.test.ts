// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMarkdownHTMLDocument,
  buildMarkdownPDFDocument,
  prepareMarkdownHTML,
  prepareMarkdownPDF,
} from "./markdownExport";

describe("Markdown PDF document", () => {
  it("builds a printable standalone HTML document", () => {
    const html = buildMarkdownPDFDocument("Guide", "<h1>Intro</h1>");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@page { size: A4");
    expect(html).toContain('<article class="tm-markdown-export"><h1>Intro</h1>');
  });

  it("escapes the document title", () => {
    const html = buildMarkdownPDFDocument("<script>x</script>", "<p>safe</p>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<title><script>");
  });
});

describe("Markdown HTML export", () => {
  it("builds a standalone HTML document with the markdown body", () => {
    const html = buildMarkdownHTMLDocument("Guide", "<h1>Intro</h1>");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<article class="tm-markdown-export"><h1>Intro</h1>');
  });

  it("renders a resized <img> as a real image, not escaped text", async () => {
    const prepared = await prepareMarkdownHTML(
      '<img src="a.png" alt="a" style="width:200px" />',
      "t",
      "",
    );
    expect(prepared.html).toContain('style="width:200px"');
    expect(prepared.html).not.toContain("&lt;img");
  });

  it("shares the same body rendering as the PDF export", async () => {
    const source = "# 标题\n\n任务：- [x] 完成\n";
    const pdf = await prepareMarkdownPDF(source, "t", "");
    const html = await prepareMarkdownHTML(source, "t", "");
    const bodyOf = (doc: string) =>
      doc.slice(doc.indexOf('<article class="tm-markdown-export">'));
    expect(bodyOf(html.html)).toBe(bodyOf(pdf.html));
  });
});
