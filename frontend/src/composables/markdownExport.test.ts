import { describe, expect, it } from "vitest";
import { buildMarkdownPDFDocument } from "./markdownExport";

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
