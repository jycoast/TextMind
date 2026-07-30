import { describe, expect, it } from "vitest";
import { isRelativeMarkdownReference } from "./markdownResources";

describe("Markdown resource references", () => {
  it.each(["./assets/a.png", "../notes/demo.md#intro", "images/a%20b.png"])(
    "recognizes local relative reference %s",
    (reference) => expect(isRelativeMarkdownReference(reference)).toBe(true),
  );

  it.each(["https://example.com/a.png", "mailto:a@example.com", "#intro", "data:image/png;base64,AA"])(
    "does not treat %s as a local relative reference",
    (reference) => expect(isRelativeMarkdownReference(reference)).toBe(false),
  );
});
