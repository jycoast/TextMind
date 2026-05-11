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

// Key on globalThis so the registration survives Vite HMR reloads of
// this module. A plain module-level boolean would be reset to false on
// each reload, causing us to call `registerInlayHintsProvider` again
// without disposing the previous one — Monaco then asks BOTH providers
// for hints and renders the same number twice on the same line.
const HMR_REGISTRATION_KEY = "__textmind_jsonElementCountHintsDisposable";

interface HmrSlot {
  dispose: monaco.IDisposable | null;
}

function getHmrSlot(): HmrSlot {
  const g = globalThis as unknown as Record<string, HmrSlot | undefined>;
  let slot = g[HMR_REGISTRATION_KEY];
  if (!slot) {
    slot = { dispose: null };
    g[HMR_REGISTRATION_KEY] = slot;
  }
  return slot;
}

/**
 * Idempotently registers a Monaco InlayHintsProvider for the `json`
 * language that renders ` <count>` after each `{` / `[`.
 *
 * Why module-level instead of per-editor:
 *
 *   - Inlay hint providers are a global registry on `monaco.languages`,
 *     not a per-editor binding. Registering once on first import is the
 *     idiomatic pattern.
 *   - We dispose any previous registration before installing a new one,
 *     so Vite HMR re-evaluating this module doesn't accumulate stacked
 *     providers (the visible symptom of which is the count being
 *     rendered twice).
 *
 * The hint cache keyed by ITextModel + versionId means typing inside a
 * large JSON doc only re-scans on actual changes, not on every viewport
 * refresh that Monaco triggers internally.
 */
export function registerJsonElementCountHints(): void {
  const slot = getHmrSlot();
  if (slot.dispose) {
    try {
      slot.dispose.dispose();
    } catch {
      // ignore — older provider already torn down
    }
    slot.dispose = null;
  }

  slot.dispose = monaco.languages.registerInlayHintsProvider("json", {
    provideInlayHints(model, range) {
      const version = model.getVersionId();
      let allHints: monaco.languages.InlayHint[];

      const cached = cache.get(model);
      if (cached && cached.version === version) {
        allHints = cached.hints;
      } else {
        const raw = computeBracketCountHints(model.getValue());
        allHints = raw.map((h) => {
          const pos = model.getPositionAt(h.offset);
          return {
            position: { lineNumber: pos.lineNumber, column: pos.column },
            label: String(h.count),
            kind: monaco.languages.InlayHintKind.Type,
            paddingLeft: true,
          };
        });
        cache.set(model, { version, hints: allHints });
      }

      // Only return hints inside the queried range, AND build a fresh
      // array on every call. Two reasons:
      //
      //   1. Folding bug: when the user collapses a region, Monaco
      //      re-queries this provider with a tighter visible range. If
      //      we hand back hints whose line is now hidden, Monaco
      //      renders them again at the fold boundary, producing the
      //      "count shown twice" duplication on the same line.
      //   2. Returning the cached array reference makes Monaco's
      //      internal hint reconciler conflate stale and fresh
      //      results, which has been observed to double-render in some
      //      versions. A new array per call sidesteps that.
      const startLine = range.startLineNumber;
      const endLine = range.endLineNumber;
      const hints: monaco.languages.InlayHint[] = [];
      for (const h of allHints) {
        const ln = h.position.lineNumber;
        if (ln >= startLine && ln <= endLine) {
          hints.push(h);
        }
      }

      return { hints, dispose: () => {} };
    },
  });
}
