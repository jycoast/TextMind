// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { defaultValueCtx, Editor } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { math } from "@milkdown/plugin-math";
import { getMarkdown as getWysiwygMarkdown } from "@milkdown/utils";
import { imageSchemaWithWidth, remarkImageWidthPlugin } from "@/plugins/builtin/editorMarkdown/imageResize";
import { renderDocumentMarkdown } from "./useMarkdown";

const editors: Editor[] = [];

async function wysiwygRoundTrip(markdown: string): Promise<string> {
  const editor = Editor.make()
    .config((ctx) => ctx.set(defaultValueCtx, markdown))
    .use(commonmark)
    .use(gfm)
    .use(imageSchemaWithWidth)
    .use(remarkImageWidthPlugin)
    .use(math);
  editors.push(editor);
  await editor.create();
  return editor.action(getWysiwygMarkdown());
}

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.replaceChildren();
});

/**
 * Contract between the WYSIWYG (Milkdown) and preview/export (markdown-it)
 * pipelines: a construct that survives WYSIWYG serialization losslessly must
 * also render in the preview pipeline as its real element — never as escaped
 * text or dropped content. This is what regressed for resized images (#23).
 */
describe("WYSIWYG / preview render consistency", () => {
  it("renders a resized <img> as an image in both pipelines", async () => {
    const source = '<img src="a.png" alt="a" style="width:200px" />\n';
    expect(await wysiwygRoundTrip(source)).toBe(source);
    const html = renderDocumentMarkdown(source);
    expect(html).toContain('<img src="a.png" alt="a" style="width:200px"');
    expect(html).not.toContain("&lt;img");
  });

  it("renders task-list checkboxes in both pipelines", async () => {
    const source = "- [x] done\n- [ ] todo\n";
    expect(await wysiwygRoundTrip(source)).toContain("[x]");
    const html = renderDocumentMarkdown(source);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders GFM footnotes in both pipelines", async () => {
    const source = "A note[^1].\n\n[^1]: Detail here.\n";
    expect(await wysiwygRoundTrip(source)).toContain("[^1]");
    const html = renderDocumentMarkdown(source);
    expect(html).toContain('class="footnote-ref"');
  });

  it("renders math in both pipelines", async () => {
    const source = "Inline $a^2+b^2$ formula.\n\n$$\n\\frac{1}{2}\n$$\n";
    expect(await wysiwygRoundTrip(source)).toContain("$");
    const html = renderDocumentMarkdown(source);
    expect(html).toContain("katex");
  });

  it("keeps mermaid as a diagram placeholder in preview, code in WYSIWYG", async () => {
    const source = "```mermaid\ngraph TD; A-->B;\n```\n";
    expect(await wysiwygRoundTrip(source)).toContain("```mermaid");
    const html = renderDocumentMarkdown(source);
    expect(html).toContain("tm-mermaid");
  });

  it("keeps code-language fences in both pipelines", async () => {
    const source = "```go\nfmt.Println(\"hi\")\n```\n";
    expect(await wysiwygRoundTrip(source)).toBe(source);
    const html = renderDocumentMarkdown(source);
    expect(html).toContain("language-go");
  });

  it("aligns GFM tables in both pipelines", async () => {
    const source = "| Left | Center |\n| :--- | :---: |\n| a | b |\n";
    expect(await wysiwygRoundTrip(source)).toContain("| :--- |");
    const html = renderDocumentMarkdown(source);
    expect(html).toContain("<table");
    expect(html).toContain("<th");
  });
});
