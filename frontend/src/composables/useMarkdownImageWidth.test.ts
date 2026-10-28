import { describe, expect, it } from "vitest";
import {
  getMarkdown,
  renderDocumentMarkdown,
  renderMarkdown,
} from "./useMarkdown";

describe("resized-image <img> HTML in the preview/export pipeline", () => {
  it("renders a standalone resized <img> as a real image with a width style", () => {
    const html = renderDocumentMarkdown(
      '<img src="a.png" alt="a" style="width:200px" />',
    );
    expect(html).toContain('<img src="a.png" alt="a" style="width:200px"');
    expect(html).not.toContain("&lt;img");
  });

  it("renders a resized image inline within a sentence", () => {
    const html = renderDocumentMarkdown(
      'See <img src="a.png" alt="a" style="width:120px" /> here.',
    );
    expect(html).toContain('style="width:120px"');
    expect(html).not.toContain("&lt;img");
  });

  it("preserves src/alt/title with escaping in the HTML form", () => {
    const html = renderDocumentMarkdown(
      '<img src="a&b.png" alt="a & b" title="a <b>" style="width:80px" />',
    );
    expect(html).toContain('src="a&amp;b.png"');
    expect(html).toContain('alt="a &amp; b"');
    expect(html).toContain('title="a &lt;b&gt;"');
    expect(html).toContain('style="width:80px"');
  });

  it("renders multiple resized images in one paragraph", () => {
    const html = renderDocumentMarkdown(
      '<img src="a.png" alt="a" style="width:100px" /> and <img src="b.png" alt="b" style="width:60px" />',
    );
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  it("leaves ordinary markdown images untouched", () => {
    const html = renderMarkdown('![x](./x.png "t")');
    expect(html).toContain('<img src="./x.png" alt="x"');
  });

  it("applies the same width style on the shared renderer (chat/release)", () => {
    const html = getMarkdown().render(
      '<img src="a.png" alt="a" style="width:200px" />',
    );
    expect(html).toContain('style="width:200px"');
  });
});
