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

.tm-md-toolbar {
  position: sticky;
  top: -16px;
  z-index: 8;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-height: 38px;
  margin: -16px -20px 12px;
  padding: 5px 20px;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  border-bottom: 1px solid var(--hairline);
  backdrop-filter: blur(8px);
  overflow: visible;
}

.tm-md-toolbar__button,
.tm-md-toolbar__select {
  height: 28px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  background: transparent;
  font: 500 12px/1 inherit;
}

.tm-md-toolbar__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  flex: 0 0 30px;
  padding: 0;
  cursor: pointer;
}

.tm-md-toolbar__button svg {
  display: block;
  pointer-events: none;
}

.tm-md-toolbar__select {
  width: 64px;
  padding: 0 6px;
  font-family: inherit;
  cursor: pointer;
}

.tm-md-toolbar__button:hover,
.tm-md-toolbar__button.is-active,
.tm-md-toolbar__select:hover,
.tm-md-toolbar__button:focus-visible,
.tm-md-toolbar__select:focus-visible {
  color: var(--text);
  border-color: var(--hairline);
  background: var(--hover-bg);
}

.tm-md-toolbar__button:focus-visible,
.tm-md-toolbar__select:focus-visible,
.tm-md-toolbar__text-button:focus-visible,
.tm-md-toolbar__menu-item:focus-visible,
.tm-md-toolbar__field input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.tm-md-toolbar__button.is-active {
  color: var(--accent);
  border-color: var(--accent);
}

.tm-md-toolbar__button:disabled,
.tm-md-toolbar__menu-item:disabled,
.tm-md-toolbar__text-button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.tm-md-toolbar__separator {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  flex: 0 0 1px;
  background: var(--hairline);
}

.tm-md-toolbar__popover[hidden] {
  display: none !important;
}

.tm-md-toolbar__popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 20px;
  z-index: 12;
  width: min(320px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 10px;
  color: var(--text);
  background: var(--panel, var(--bg));
  border: 1px solid var(--hairline);
  border-radius: 6px;
  box-shadow: 0 8px 24px color-mix(in srgb, #000 20%, transparent);
}

.tm-md-toolbar__popover--form {
  display: grid;
  gap: 8px;
}

.tm-md-toolbar__field {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
}

.tm-md-toolbar__field input {
  width: 100%;
  height: 30px;
  box-sizing: border-box;
  padding: 0 8px;
  color: var(--text);
  background: var(--panel-input, var(--bg));
  border: 1px solid var(--hairline);
  border-radius: 4px;
  font: 13px/1.2 inherit;
}

.tm-md-toolbar__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 2px;
}

.tm-md-toolbar__text-button {
  min-height: 28px;
  padding: 0 10px;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  font: 12px/1 inherit;
  cursor: pointer;
}

.tm-md-toolbar__text-button:hover {
  background: var(--hover-bg);
}

.tm-md-toolbar__text-button.is-primary {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}

.tm-md-toolbar__text-button--danger:not(:disabled) {
  color: #e06c75;
}

.tm-md-toolbar__table-menu {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  width: min(360px, calc(100vw - 32px));
}

.tm-md-toolbar__menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 30px;
  padding: 5px 7px;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  font: 12px/1.25 inherit;
  text-align: left;
  cursor: pointer;
}

.tm-md-toolbar__menu-item svg {
  flex: 0 0 15px;
  width: 15px;
  height: 15px;
}

.tm-md-toolbar__menu-item:hover:not(:disabled),
.tm-md-toolbar__menu-item.is-active {
  color: var(--accent);
  background: var(--hover-bg);
  border-color: var(--hairline);
}

@media (max-width: 700px) {
  .tm-md-toolbar {
    padding-right: 10px;
    padding-left: 10px;
  }
  .tm-md-toolbar__separator {
    margin-right: 2px;
    margin-left: 2px;
  }
  .tm-md-toolbar__popover {
    right: 10px;
  }
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

/* Read-only YAML front matter header shown above the editable body. The block
   is kept out of the Milkdown doc (remark would mangle it) and rendered here as
   an inert <pre>; it round-trips verbatim on save. See markdownFrontMatter.ts. */
.tm-milkdown-host .tm-md-frontmatter {
  margin: 0 0 12px;
  padding: 10px 12px;
  color: var(--muted);
  background: var(--panel-input, var(--panel));
  border: 1px dashed var(--hairline);
  border-radius: 4px;
  font-family: Consolas, "Courier New", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: none;
  cursor: default;
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

/* Copy-code button in the top-right corner; mirrors the badge's quiet-by-
   default / brighten-on-hover behavior. */
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
  line-height: 18px;
  color: var(--muted);
  background: var(--bg, var(--panel));
  border: 1px solid var(--hairline);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  user-select: none;
}
.tm-milkdown-host .ProseMirror pre:hover .tm-md-codeblock-copy,
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-copy:focus-visible,
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-copy.is-copied {
  opacity: 1;
}
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-copy:hover {
  color: var(--text);
  border-color: var(--accent);
}
.tm-milkdown-host .ProseMirror pre .tm-md-codeblock-copy.is-copied {
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

.tm-milkdown-host .ProseMirror .tm-md-mermaid-preview {
  display: none;
}

.tm-milkdown-host .ProseMirror .tm-md-codeblock--mermaid .tm-md-mermaid-preview {
  display: block;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline);
  color: var(--text);
  text-align: center;
  white-space: normal;
  overflow-x: auto;
}

.tm-milkdown-host .ProseMirror .tm-md-mermaid-preview svg {
  display: inline-block;
  max-width: 100%;
  height: auto;
}

.tm-milkdown-host .ProseMirror .tm-md-mermaid-preview[data-state="error"] {
  color: #e06c75;
  text-align: left;
  white-space: pre-wrap;
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

/* Image node wrapper — the resize handle lives in the corner. The live
   width is applied via inline style on the <img> and is intentionally not
   persisted (Markdown has no image-width syntax; see localImageView.ts). */
.tm-milkdown-host .ProseMirror .tm-md-image-node {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}
.tm-milkdown-host .ProseMirror .tm-md-image-node img {
  display: block;
  max-width: 100%;
}
.tm-milkdown-host .ProseMirror .tm-md-image-node__handle {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border-right: 2px solid var(--accent);
  border-bottom: 2px solid var(--accent);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  user-select: none;
}
.tm-milkdown-host .ProseMirror .tm-md-image-node:hover .tm-md-image-node__handle,
.tm-milkdown-host .ProseMirror .tm-md-image-node__handle.is-dragging {
  opacity: 1;
}
.tm-milkdown-host .ProseMirror .tm-md-image-node__handle.is-dragging {
  width: 18px;
  height: 18px;
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

/* GFM footnotes (Milkdown preset-gfm ships the reference + definition nodes).
   The in-text reference is a small accent superscript; definitions are grouped
   as a muted definition list at the foot of the document. */
.tm-milkdown-host .ProseMirror sup[data-type="footnote_reference"] {
  color: var(--accent);
  font-size: 0.75em;
  vertical-align: super;
  margin: 0 1px;
  cursor: pointer;
}
.tm-milkdown-host .ProseMirror dl[data-type="footnote_definition"] {
  margin: 1.2em 0 0;
  padding-top: 0.6em;
  border-top: 1px solid var(--hairline);
  color: var(--muted);
}
.tm-milkdown-host .ProseMirror dl[data-type="footnote_definition"] dt {
  display: inline-block;
  min-width: 1.4em;
  color: var(--accent);
  font-size: 0.85em;
}
.tm-milkdown-host .ProseMirror dl[data-type="footnote_definition"] dd {
  display: inline;
  margin: 0;
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
  top: 22px;
  margin-left: auto;
  margin-right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  width: fit-content;
  background: var(--panel, var(--bg));
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 4px 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 12px;
}
.tm-milkdown-find__row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tm-milkdown-find__input,
.tm-milkdown-find__replace {
  background: var(--panel-input, var(--bg));
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  padding: 2px 6px;
  width: 180px;
  font-size: 12px;
  outline: none;
}
.tm-milkdown-find__input:focus,
.tm-milkdown-find__replace:focus {
  border-color: var(--accent);
}
.tm-milkdown-find__replace {
  width: 180px;
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
