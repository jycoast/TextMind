// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { defaultValueCtx, Editor } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { math } from "@milkdown/plugin-math";
import { getMarkdown } from "@milkdown/utils";

const editors: Editor[] = [];

async function roundTrip(markdown: string): Promise<string> {
  const editor = Editor.make()
    .config((ctx) => ctx.set(defaultValueCtx, markdown))
    .use(commonmark)
    .use(gfm)
    .use(math);
  editors.push(editor);
  await editor.create();
  return editor.action(getMarkdown());
}

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.replaceChildren();
});

describe("Milkdown Markdown round trip", () => {
  it.each([
    ["nested and task lists", "- parent\n  - [x] complete\n  - [ ] pending\n"],
    ["aligned GFM table", "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n"],
    ["image metadata", "![Alternative](./image.png \"Image title\")\n"],
    ["inline marks and escapes", "Use **bold**, *emphasis*, `a|b`, and \\*literal\\*.\n"],
    ["fenced code language", "```typescript\nconst value = `a|b`;\n```\n"],
    ["inline and block math", "Inline $a^2+b^2$ formula.\n\n$$\n\\frac{1}{2}\n$$\n"],
  ])("stabilizes supported %s syntax after serialization", async (_name, source) => {
    const once = await roundTrip(source);
    const twice = await roundTrip(once);
    expect(twice).toBe(once);
  });

  it("preserves table content, alignment, image alt and code language", async () => {
    const output = await roundTrip(
      "| A | B |\n| :--- | ---: |\n| one | two |\n\n![Alt](a.png \"Title\")\n\n```go\nfmt.Println(1)\n```\n",
    );
    expect(output).toContain("one");
    expect(output).toMatch(/:\-+/);
    expect(output).toMatch(/\-+:/);
    expect(output).toContain("![Alt](a.png \"Title\")");
    expect(output).toContain("```go");
  });
});
