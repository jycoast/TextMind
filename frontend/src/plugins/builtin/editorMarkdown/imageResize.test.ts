// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { defaultValueCtx, Editor } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { math } from "@milkdown/plugin-math";
import { getMarkdown } from "@milkdown/utils";
import { imageSchemaWithWidth, remarkImageWidthPlugin } from "./imageResize";

const editors: Editor[] = [];

async function roundTrip(markdown: string): Promise<string> {
  const editor = Editor.make()
    .config((ctx) => ctx.set(defaultValueCtx, markdown))
    .use(commonmark)
    .use(gfm)
    .use(imageSchemaWithWidth)
    .use(remarkImageWidthPlugin)
    .use(math);
  editors.push(editor);
  await editor.create();
  return editor.action(getMarkdown());
}

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.replaceChildren();
});

describe("persisted image resize", () => {
  it("leaves a plain image untouched (no width -> markdown syntax)", async () => {
    const src = "![Alternative](./image.png \"Image title\")\n";
    const once = await roundTrip(src);
    expect(once).toBe(src);
  });

  it("serializes a resized image as raw <img> HTML and round-trips it", async () => {
    // Feed a resized image in its serialized form.
    const resized = '<img src="a.png" alt="alt" style="width:200px" />\n';
    const once = await roundTrip(resized);
    expect(once).toBe(resized);
    const twice = await roundTrip(once);
    expect(twice).toBe(resized);
  });

  it("round-trips a resized image inline within a sentence", async () => {
    const resized = 'See <img src="a.png" alt="a" style="width:120px" /> here.\n';
    const once = await roundTrip(resized);
    expect(once).toBe(resized);
  });

  it("preserves src/alt/title with escaping in the HTML form", async () => {
    const resized = '<img src="a&b.png" alt="a & b" title="a <b>" style="width:80px" />\n';
    const once = await roundTrip(resized);
    expect(once).toBe(resized);
  });

  it("does not convert a non-resized raw <img> into markdown", async () => {
    // A raw img WITHOUT a width stays as raw HTML (not normalized to markdown).
    const src = '<img src="x.png" alt="x" />\n';
    const once = await roundTrip(src);
    expect(once).toContain("<img");
  });
});
