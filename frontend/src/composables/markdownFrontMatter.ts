// YAML front matter detection / extraction.
//
// Front matter is the optional `---`-delimited YAML block that some Markdown
// tooling (Jekyll, Hugo, Obsidian) places at the very top of a document. Its
// shape is exactly:
//
//   ---
//   title: ...
//   tags: [...]
//   ---
//
// We deliberately do NOT route it through Milkdown: remark parses `---` as a
// thematic break, so feeding front matter into the WYSIWYG editor silently
// mangles it (verified — `---` → `***`, list bullets get injected into `tags:`
// lists). Instead the editor strips the block at load, keeps it verbatim as an
// opaque string, renders it as a read-only header above the editable body, and
// re-prefixes it on save. Round-tripping through a plain string guarantees the
// front matter is preserved byte-for-byte no matter how the body is edited.

export interface FrontMatterResult {
  /** The full front matter block INCLUDING its `---` delimiters ("" if none). */
  frontMatter: string;
  /** The document with the front matter block removed. */
  body: string;
}

// Opening delimiter on its own line at the very start (BOM tolerated).
const OPEN = /^\uFEFF?---[ \t]*\r?\n/;
// Full block: opening line ... a closing line that starts with `---` or `...`.
// The lazy body stops at the FIRST closing fence, and the closing fence must
// be followed by a newline or end-of-input. Requiring a closing delimiter is
// what distinguishes real front matter from a document that merely opens with
// a thematic break (`---` alone is an <hr>, not front matter).
const BLOCK =
  /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** Strip a leading YAML front matter block from `md`, returning it separately. */
export function extractFrontMatter(md: string): FrontMatterResult {
  if (typeof md !== "string") return { frontMatter: "", body: md };
  const match = BLOCK.exec(md);
  if (!match) return { frontMatter: "", body: md };
  return {
    frontMatter: match[0].replace(/^\uFEFF/, ""),
    body: md.slice(match[0].length),
  };
}

/**
 * Re-attach a previously extracted front matter block to a document body.
 * `body` already contains whatever blank lines separated the block from the
 * body (they were part of `body` after extraction), so simple concatenation is
 * byte-exact.
 */
export function restoreFrontMatter(frontMatter: string, body: string): string {
  if (!frontMatter) return body;
  return frontMatter + body;
}

/** Convenience: is there a YAML front matter block at the start of `md`? */
export function hasFrontMatter(md: string): boolean {
  return OPEN.test(md) && BLOCK.test(md);
}
