import { describe, expect, it } from "vitest";
import { extractFrontMatter, restoreFrontMatter, hasFrontMatter } from "./markdownFrontMatter";

describe("markdownFrontMatter", () => {
  it("extracts and restores a leading YAML block byte-for-byte", () => {
    const src = "---\ntitle: My Doc\ntags:\n  - a\n  - b\ndate: 2026-08-20\n---\n\n# Heading\n\nbody\n";
    const { frontMatter, body } = extractFrontMatter(src);
    expect(frontMatter).toBe("---\ntitle: My Doc\ntags:\n  - a\n  - b\ndate: 2026-08-20\n---\n");
    expect(body).toBe("\n# Heading\n\nbody\n");
    expect(restoreFrontMatter(frontMatter, body)).toBe(src);
    expect(hasFrontMatter(src)).toBe(true);
  });

  it("supports the `...` closing delimiter", () => {
    const src = "---\nkey: value\n...\n# Body\n";
    const { frontMatter, body } = extractFrontMatter(src);
    expect(frontMatter).toBe("---\nkey: value\n...\n");
    expect(body).toBe("# Body\n");
    expect(restoreFrontMatter(frontMatter, body)).toBe(src);
  });

  it("ignores a lone leading `---` that is a thematic break, not front matter", () => {
    const src = "---\n\n# Heading\n";
    const { frontMatter, body } = extractFrontMatter(src);
    expect(frontMatter).toBe("");
    expect(body).toBe(src);
    expect(hasFrontMatter(src)).toBe(false);
  });

  it("handles no front matter and empty input", () => {
    expect(extractFrontMatter("")).toEqual({ frontMatter: "", body: "" });
    const plain = "# Only body\n";
    expect(extractFrontMatter(plain)).toEqual({ frontMatter: "", body: plain });
  });

  it("tolerates a UTF-8 BOM before the opening fence", () => {
    const src = "\uFEFF---\ntitle: x\n---\n# B\n";
    const { frontMatter, body } = extractFrontMatter(src);
    expect(frontMatter).toBe("---\ntitle: x\n---\n");
    expect(body).toBe("# B\n");
  });
});
