// Minimal Milkdown stylesheet that piggybacks on the app's CSS variables
// so the editor follows light/dark mode automatically. Scoped under
// `.tm-milkdown-host` to avoid colliding with any other rendered markdown
// (e.g. the AI chat panel uses markdown-it + custom CSS).
//
// We deliberately do not import any Milkdown-provided theme: those are
// hardcoded against Nord's dark palette and become unreadable in light mode.

export const themedStyles = /* css */ `
.tm-milkdown-host {
  color: var(--text);
  background: var(--bg);
  font-size: 14px;
  line-height: 1.7;
}

.tm-milkdown-host .milkdown,
.tm-milkdown-host .editor,
.tm-milkdown-host .ProseMirror {
  outline: none;
  color: var(--text);
  background: transparent;
  min-height: 100%;
  caret-color: var(--accent);
}

.tm-milkdown-host .ProseMirror p,
.tm-milkdown-host .ProseMirror li {
  margin: 0.5em 0;
  color: var(--text);
}

.tm-milkdown-host .ProseMirror h1,
.tm-milkdown-host .ProseMirror h2,
.tm-milkdown-host .ProseMirror h3,
.tm-milkdown-host .ProseMirror h4,
.tm-milkdown-host .ProseMirror h5,
.tm-milkdown-host .ProseMirror h6 {
  color: var(--text);
  margin: 1.2em 0 0.6em;
  font-weight: 600;
  line-height: 1.3;
}
.tm-milkdown-host .ProseMirror h1 { font-size: 1.7em; }
.tm-milkdown-host .ProseMirror h2 { font-size: 1.4em; padding-bottom: 0.25em; border-bottom: 1px solid var(--hairline); }
.tm-milkdown-host .ProseMirror h3 { font-size: 1.2em; }
.tm-milkdown-host .ProseMirror h4 { font-size: 1.05em; }
.tm-milkdown-host .ProseMirror h5,
.tm-milkdown-host .ProseMirror h6 { font-size: 1em; color: var(--muted); }

.tm-milkdown-host .ProseMirror a {
  color: var(--accent);
  text-decoration: none;
}
.tm-milkdown-host .ProseMirror a:hover { text-decoration: underline; }

.tm-milkdown-host .ProseMirror strong { font-weight: 600; }
.tm-milkdown-host .ProseMirror em { font-style: italic; }

.tm-milkdown-host .ProseMirror code {
  background: var(--panel-input, var(--panel));
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 0 4px;
  font-family: Consolas, "Courier New", ui-monospace, monospace;
  font-size: 0.92em;
}

.tm-milkdown-host .ProseMirror pre {
  background: var(--panel-input, var(--panel));
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 0.8em 0;
  /* Anchor for the language badge overlay (codeBlockLanguageView.ts). */
  position: relative;
}

/* Editable language badge in the bottom-right corner of every code block.
   Always rendered but kept quiet by default so it doesn't compete with the
   code; brightens on hover or when the input is focused. */
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-lang {
  position: absolute;
  right: 6px;
  bottom: 4px;
  display: flex;
  align-items: center;
  z-index: 2;
  opacity: 0.35;
  transition: opacity 0.15s ease-in-out;
  user-select: none;
}
.tm-milkdown-host .ProseMirror pre:hover .tm-md-codeblock-lang,
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-lang:focus-within {
  opacity: 1;
}
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-lang__input {
  width: 96px;
  height: 18px;
  padding: 0 6px;
  font-family: Consolas, "Courier New", ui-monospace, monospace;
  font-size: 11px;
  line-height: 16px;
  color: var(--muted);
  background: var(--bg, var(--panel));
  border: 1px solid var(--hairline);
  border-radius: 3px;
  outline: none;
  text-align: right;
  caret-color: var(--accent);
}
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-lang__input::placeholder {
  color: var(--muted);
  opacity: 0.6;
}
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-lang__input:focus {
  color: var(--text);
  border-color: var(--accent);
}
.tm-milkdown-host .ProseMirror pre code {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.92em;
  color: var(--text);
}

/* Prism token coloring for code blocks (@milkdown/plugin-prism).
   Mapped onto our CSS variables where possible so the palette stays
   readable in both light and dark themes; falls back to VS Code
   Dark+ inspired hues for token classes that have no semantic
   equivalent in the app theme. Only takes effect for code blocks
   whose language is registered in MilkdownAdapter.ts; unmarked
   fences keep the plain var(--text) color. */
.tm-milkdown-host .ProseMirror pre code .token.keyword,
.tm-milkdown-host .ProseMirror pre code .token.builtin,
.tm-milkdown-host .ProseMirror pre code .token.important {
  color: var(--accent);
}
.tm-milkdown-host .ProseMirror pre code .token.string,
.tm-milkdown-host .ProseMirror pre code .token.char,
.tm-milkdown-host .ProseMirror pre code .token.regex,
.tm-milkdown-host .ProseMirror pre code .token.attr-value {
  color: #ce9178;
}
.tm-milkdown-host .ProseMirror pre code .token.comment,
.tm-milkdown-host .ProseMirror pre code .token.prolog,
.tm-milkdown-host .ProseMirror pre code .token.doctype,
.tm-milkdown-host .ProseMirror pre code .token.cdata {
  color: var(--muted);
  font-style: italic;
}
.tm-milkdown-host .ProseMirror pre code .token.number,
.tm-milkdown-host .ProseMirror pre code .token.boolean,
.tm-milkdown-host .ProseMirror pre code .token.constant,
.tm-milkdown-host .ProseMirror pre code .token.symbol {
  color: #b5cea8;
}
.tm-milkdown-host .ProseMirror pre code .token.function,
.tm-milkdown-host .ProseMirror pre code .token.class-name {
  color: #dcdcaa;
}
.tm-milkdown-host .ProseMirror pre code .token.operator,
.tm-milkdown-host .ProseMirror pre code .token.punctuation {
  color: var(--text);
  opacity: 0.85;
}
.tm-milkdown-host .ProseMirror pre code .token.tag,
.tm-milkdown-host .ProseMirror pre code .token.selector,
.tm-milkdown-host .ProseMirror pre code .token.attr-name,
.tm-milkdown-host .ProseMirror pre code .token.property {
  color: #569cd6;
}
.tm-milkdown-host .ProseMirror pre code .token.variable,
.tm-milkdown-host .ProseMirror pre code .token.parameter {
  color: #9cdcfe;
}
.tm-milkdown-host .ProseMirror pre code .token.deleted { color: #e06c75; }
.tm-milkdown-host .ProseMirror pre code .token.inserted { color: #b5cea8; }
.tm-milkdown-host .ProseMirror pre code .token.bold { font-weight: 600; }
.tm-milkdown-host .ProseMirror pre code .token.italic { font-style: italic; }

.tm-milkdown-host .ProseMirror blockquote {
  border-left: 3px solid var(--hairline);
  margin: 0.8em 0;
  padding: 0.2em 0 0.2em 12px;
  color: var(--muted);
  background: transparent;
}
.tm-milkdown-host .ProseMirror blockquote p { color: inherit; }

.tm-milkdown-host .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--hairline);
  margin: 1.2em 0;
}

/* Tailwind's preflight resets list-style on every ul/ol globally, which
   wipes out the bullets/numbers we want inside the editor. Re-assert them
   here so Markdown lists render with the expected markers in WYSIWYG. */
.tm-milkdown-host .ProseMirror ul,
.tm-milkdown-host .ProseMirror ol {
  padding-left: 1.6em;
  margin: 0.6em 0;
  list-style-position: outside;
}
.tm-milkdown-host .ProseMirror ul { list-style-type: disc; }
.tm-milkdown-host .ProseMirror ol { list-style-type: decimal; }
.tm-milkdown-host .ProseMirror ul ul { list-style-type: circle; }
.tm-milkdown-host .ProseMirror ul ul ul { list-style-type: square; }
.tm-milkdown-host .ProseMirror ol ol { list-style-type: lower-alpha; }
.tm-milkdown-host .ProseMirror ol ol ol { list-style-type: lower-roman; }

.tm-milkdown-host .ProseMirror li {
  /* Tailwind also resets display on li in some configurations; this keeps
     the bullet aligned with the first line of text. */
  display: list-item;
}

.tm-milkdown-host .ProseMirror ul ul,
.tm-milkdown-host .ProseMirror ol ol,
.tm-milkdown-host .ProseMirror ul ol,
.tm-milkdown-host .ProseMirror ol ul { margin: 0.2em 0; }

.tm-milkdown-host .ProseMirror table {
  border-collapse: collapse;
  border: 1px solid var(--hairline);
  margin: 0.8em 0;
  overflow: hidden;
  width: auto;
}
.tm-milkdown-host .ProseMirror th,
.tm-milkdown-host .ProseMirror td {
  border: 1px solid var(--hairline);
  padding: 6px 10px;
  color: var(--text);
  vertical-align: top;
}
.tm-milkdown-host .ProseMirror th {
  background: var(--panel);
  font-weight: 600;
  text-align: left;
}
.tm-milkdown-host .ProseMirror tr:nth-child(even) td {
  background: var(--panel);
}

.tm-milkdown-host .ProseMirror img {
  max-width: 100%;
  border-radius: 4px;
  border: 1px solid var(--hairline);
}

/* Math nodes (KaTeX rendered via @milkdown/plugin-math).
   Both inline and block formulas are atom nodes, so we draw a thin
   selection ring when the node is selected to make it clear it's
   editable as a unit (edit via source mode). */
.tm-milkdown-host .ProseMirror span[data-type="math_inline"] {
  display: inline-block;
  padding: 0 2px;
  color: var(--text);
  cursor: default;
}
.tm-milkdown-host .ProseMirror span[data-type="math_inline"].ProseMirror-selectednode {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
  border-radius: 3px;
}
.tm-milkdown-host .ProseMirror div[data-type="math_block"] {
  display: block;
  margin: 0.8em 0;
  padding: 8px 12px;
  background: var(--panel-input, var(--panel));
  border: 1px solid var(--hairline);
  border-radius: 4px;
  color: var(--text);
  overflow-x: auto;
  text-align: center;
  cursor: default;
}
.tm-milkdown-host .ProseMirror div[data-type="math_block"].ProseMirror-selectednode {
  outline: 1px solid var(--accent);
}
.tm-milkdown-host .ProseMirror .katex { color: var(--text); }
.tm-milkdown-host .ProseMirror .katex-display {
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
}
.tm-milkdown-host .ProseMirror .katex-error { color: #e06c75; }

.tm-milkdown-host .ProseMirror .task-list-item {
  list-style: none;
}
.tm-milkdown-host .ProseMirror input[type="checkbox"] {
  margin-right: 6px;
  accent-color: var(--accent);
}

/* Selection — mirror Monaco-ish accent tint. */
.tm-milkdown-host .ProseMirror ::selection {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}

/* Placeholder for an empty doc. */
.tm-milkdown-host .ProseMirror p.is-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--muted);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Find bar — sticks to the top of the scrollable editor host, right-aligned. */
.tm-milkdown-find {
  position: sticky;
  top: 4px;
  margin-left: auto;
  margin-right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  background: var(--panel, var(--bg));
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 4px 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 12px;
}
.tm-milkdown-find__input {
  background: var(--panel-input, var(--bg));
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 2px 6px;
  width: 180px;
  font-size: 12px;
  outline: none;
}
.tm-milkdown-find__input:focus {
  border-color: var(--accent);
}
.tm-milkdown-find__count {
  color: var(--muted);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.tm-milkdown-find__btn {
  background: transparent;
  border: 1px solid var(--hairline);
  color: var(--text);
  border-radius: 3px;
  padding: 1px 7px;
  cursor: pointer;
  line-height: 1.2;
  font-size: 12px;
}
.tm-milkdown-find__btn:hover {
  background: var(--overlay, rgba(127,127,127,0.12));
  border-color: var(--accent);
}
`;
