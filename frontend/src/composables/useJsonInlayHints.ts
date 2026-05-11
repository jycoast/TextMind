import * as monaco from "monaco-editor";

/**
 * One hint entry produced by {@link computeBracketCountHints}: the byte
 * offset at which to render the count (just past the opening bracket)
 * and the number of immediate children that bracket contains.
 */
export interface BracketCountHint {
  offset: number;
  count: number;
}

interface ScopeFrame {
  open: number;
  commaCount: number;
  sawAny: boolean;
}

/**
 * Scans a JSON-ish string and returns one hint per `{` / `[` describing
 * how many top-level children that container holds.
 *
 * The scanner is deliberately lenient — it never throws on malformed
 * input, just skips the unbalanced bracket. That matters because the
 * editor calls us mid-typing, where the JSON is almost always temporarily
 * invalid (a closing `}` not yet typed, a string still open, etc).
 *
 * Counting rule: `count = commas + 1` when the scope contains any
 * non-whitespace content, else `0`. This naturally handles trailing
 * commas the user may type briefly while editing — the count will
 * temporarily over-report by one, which we accept as the cheaper
 * alternative to a real parser.
 *
 * Strings are tracked with a single boolean + escape flag so brackets,
 * commas, and quotes inside string literals don't pollute the counts.
 */
export function computeBracketCountHints(text: string): BracketCountHint[] {
  const hints: BracketCountHint[] = [];
  if (!text) return hints;

  const stack: ScopeFrame[] = [];
  let inString = false;
  let escaped = false;

  const markParentSawAny = () => {
    if (stack.length > 0) {
      stack[stack.length - 1].sawAny = true;
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === 92 /* \ */) {
        escaped = true;
        continue;
      }
      if (ch === 34 /* " */) {
        inString = false;
      }
      continue;
    }

    if (ch === 34 /* " */) {
      markParentSawAny();
      inString = true;
      continue;
    }

    if (ch === 123 /* { */ || ch === 91 /* [ */) {
      markParentSawAny();
      stack.push({ open: i, commaCount: 0, sawAny: false });
      continue;
    }

    if (ch === 125 /* } */ || ch === 93 /* ] */) {
      const frame = stack.pop();
      if (!frame) continue;
      const count = frame.sawAny ? frame.commaCount + 1 : 0;
      hints.push({ offset: frame.open + 1, count });
      continue;
    }

    if (ch === 44 /* , */ && stack.length > 0) {
      const top = stack[stack.length - 1];
      top.commaCount += 1;
      top.sawAny = true;
      continue;
    }

    // Anything else (a digit, letter, colon, etc.) counts as content for
    // the current scope. Whitespace is the only thing that does not.
    if (
      stack.length > 0 &&
      ch !== 32 /* space */ &&
      ch !== 9 /* tab */ &&
      ch !== 10 /* \n */ &&
      ch !== 13 /* \r */
    ) {
      stack[stack.length - 1].sawAny = true;
    }
  }

  return hints;
}

interface CacheEntry {
  version: number;
  hints: monaco.languages.InlayHint[];
}

const cache = new WeakMap<monaco.editor.ITextModel, CacheEntry>();

let registered = false;

/**
 * Idempotently registers a Monaco InlayHintsProvider for the `json`
 * language that renders ` <count>` after each `{` / `[`.
 *
 * Why module-level instead of per-editor:
 *
 *   - Inlay hint providers are a global registry on `monaco.languages`,
 *     not a per-editor binding. Registering once on first import is the
 *     idiomatic pattern.
 *   - The internal `registered` guard makes repeated calls safe — handy
 *     during Vite HMR, where the consumer module may re-evaluate this
 *     import.
 *
 * The hint cache keyed by ITextModel + versionId means typing inside a
 * large JSON doc only re-scans on actual changes, not on every viewport
 * refresh that Monaco triggers internally.
 */
export function registerJsonElementCountHints(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerInlayHintsProvider("json", {
    provideInlayHints(model) {
      const cached = cache.get(model);
      const version = model.getVersionId();
      if (cached && cached.version === version) {
        return { hints: cached.hints, dispose: () => {} };
      }

      const raw = computeBracketCountHints(model.getValue());
      const hints: monaco.languages.InlayHint[] = raw.map((h) => {
        const pos = model.getPositionAt(h.offset);
        return {
          position: { lineNumber: pos.lineNumber, column: pos.column },
          label: String(h.count),
          kind: monaco.languages.InlayHintKind.Type,
          paddingLeft: true,
        };
      });

      cache.set(model, { version, hints });
      return { hints, dispose: () => {} };
    },
  });
}
