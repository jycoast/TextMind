// Markdown outline extractor.
//
// Scans plain markdown source line-by-line, collecting ATX headings
// (`# ` … `###### `). Fenced code blocks (``` and ~~~) are tracked so that
// `# foo` lines inside them are ignored.
//
// Kept intentionally tiny: no AST, no CommonMark normalization (the editor
// itself owns rendering). The output is consumed by OutlinePanel.vue and by
// the editor adapters that need to "jump to heading N".

export interface OutlineItem {
  /** Heading level 1-6. */
  level: number;
  /** Heading text with surrounding whitespace and trailing #s stripped. */
  text: string;
  /** 1-based line number in the source. Used by Monaco's revealLine. */
  line: number;
  /** 0-based index across the whole document. Used by Milkdown to locate
   *  the Nth heading node in its ProseMirror doc. */
  index: number;
}

const FENCE_RE = /^\s{0,3}(```|~~~)/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

export function parseMarkdownOutline(text: string): OutlineItem[] {
  if (!text) return [];
  const out: OutlineItem[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const fence = FENCE_RE.exec(raw);
    if (fence) {
      // Open / close based on marker so that ``` doesn't accidentally
      // close a ~~~ block (and vice versa). Re-opens with a different
      // marker are treated as a new fence.
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fenceMarker === fence[1]) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(raw);
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;
    out.push({
      level: m[1].length,
      text,
      line: i + 1,
      index: out.length,
    });
  }
  return out;
}
