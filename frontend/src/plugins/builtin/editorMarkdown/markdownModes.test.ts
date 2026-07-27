import { describe, expect, it } from "vitest";
import type { Tab } from "@/types";
import {
  editorIdForMode,
  getNextMode,
  supportsWysiwyg,
} from "./markdownModes";

function tab(text: string, title = "demo.md"): Tab {
  return {
    id: "test",
    title,
    text,
    language: "markdown",
    path: title,
    viewState: null,
    dirty: false,
    encoding: "utf-8",
    hasBOM: false,
  };
}

describe("Markdown editor mode cycle", () => {
  it("cycles safe Markdown through WYSIWYG, split and source", () => {
    const document = tab("# Demo");
    expect(getNextMode(document)).toBe("split");
    document.editorId = editorIdForMode("split");
    expect(getNextMode(document)).toBe("source");
    document.editorId = editorIdForMode("source");
    expect(getNextMode(document)).toBe("wysiwyg");
  });

  it("does not select a Markdown editor for plain text", () => {
    const document = tab("plain text", "notes.txt");
    document.language = "plaintext";
    expect(supportsWysiwyg(document)).toBe(false);
  });

  it.each([
    ["page.mdx", "export const x = 1"],
    ["page.md", "---\ntitle: Demo\n---\n# Demo"],
    ["page.md", "<details>content</details>"],
    ["page.md", "Note[^one].\n\n[^one]: Detail"],
  ])("keeps protected %s content out of WYSIWYG", (title, source) => {
    const document = tab(source, title);
    expect(getNextMode(document)).toBe("split");
    document.editorId = editorIdForMode("split");
    expect(getNextMode(document)).toBe("source");
  });
});
