// Persisted image resizing, Typora-style.
//
// Markdown/CommonMark has no native image-width syntax (kramdown's `=200`
// suffix breaks remark's image parsing entirely — verified). To persist a
// resized width we follow Typora: a resized image is serialized as an inline
// raw-HTML tag carrying the size in its style:
//
//   <img src="a.png" alt="alt" style="width:200px" />
//
// Because that is raw HTML, remark parses it as an `html` node rather than an
// `image` node. So we add three pieces:
//
//   1. An `image` schema override that adds a `width` attr and (a) serializes
//      a node that HAS a width as the `<img style>` above, while (b) leaving a
//      plain `![alt](src "title")` untouched when it does NOT.
//   2. A remark transformer that converts `<img ... style="width:Npx">` HTML
//      back into an `image` node carrying that width, so the editor treats it
//      as a real image again (resize handle + toolbar). Non-resized `<img>`
//      tags are left alone and keep flowing through the existing html node.
//   3. A NodeView (localImageView.ts) that persists the drag by dispatching a
//      `setNodeMarkup` with the new `width` attr.

import { $nodeSchema, $remark } from "@milkdown/utils";
import type { Root } from "@milkdown/transformer";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** Pull a quoted attribute value out of a raw `<img ...>` tag string. */
function attrValue(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

/** Extract a pixel width from a CSS `width:NNpx` style declaration. */
function styleWidth(style: string): string | null {
  const match = style.match(/width\s*:\s*([0-9.]+)\s*px/i);
  return match ? match[1] : null;
}

/**
 * Override of Milkdown's built-in `image` schema that adds a nullable `width`
 * attr. Registering a node schema with the same id AFTER commonmark replaces
 * the built-in one. Plain images keep their existing round-trip; images with a
 * width serialize as raw `<img style="width:Npx">` HTML.
 */
export const imageSchemaWithWidth = $nodeSchema("image", () => ({
  inline: true,
  group: "inline",
  selectable: true,
  draggable: true,
  marks: "",
  atom: true,
  defining: true,
  isolating: true,
  attrs: {
    src: { default: "", validate: "string" },
    alt: { default: "", validate: "string" },
    title: { default: "", validate: "string" },
    width: {
      default: null,
      validate: (value: unknown) => value === null || typeof value === "string",
    },
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom: unknown) => {
        if (!(dom instanceof HTMLElement)) return {};
        const styleWidth = dom.style.width
          ? styleWidthFromCss(dom.style.width)
          : null;
        return {
          src: dom.getAttribute("src") || "",
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || dom.getAttribute("alt") || "",
          width: dom.getAttribute("width") || styleWidth,
        };
      },
    },
  ],
  toDOM: (node) => {
    const width = node.attrs.width as string | null;
    const style = width ? `width:${width}px` : undefined;
    return [
      "img",
      {
        src: node.attrs.src,
        alt: node.attrs.alt,
        title: node.attrs.title || undefined,
        ...(style ? { style } : {}),
      },
    ];
  },
  parseMarkdown: {
    match: ({ type }) => type === "image",
    runner: (state, node, type) => {
      state.addNode(type, {
        src: node.url as string,
        alt: node.alt as string,
        title: (node.title as string) || "",
        width: node.width != null ? String(node.width) : null,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "image",
    runner: (state, node) => {
      const width = node.attrs.width as string | null;
      if (width) {
        const src = escapeAttr(node.attrs.src);
        const alt = escapeAttr(node.attrs.alt);
        const title = node.attrs.title ? ` title="${escapeAttr(node.attrs.title)}"` : "";
        state.addNode("html", undefined, `<img src="${src}" alt="${alt}"${title} style="width:${width}px" />`);
      } else {
        state.addNode("image", undefined, undefined, {
          title: node.attrs.title,
          url: node.attrs.src,
          alt: node.attrs.alt,
        });
      }
    },
  },
}));

/**
 * Remark transformer: rewrite `<img ... style="width:Npx">` raw-HTML nodes into
 * `image` nodes carrying the width, so Milkdown parses them back as editable
 * images (not inert html atoms). Only img tags that actually declare a width
 * are converted; everything else keeps the default behavior.
 */
// Internal loose node shape for mdast-tree traversal. mdast nodes are plain
// objects; typing them strictly here fights the union types for no benefit.
type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  title?: string;
  width?: string;
  children?: MdastNode[];
  [key: string]: unknown;
};

export function remarkResizedImages() {
  return (tree: Root) => {
    const convert = (nodes: MdastNode[]): void => {
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (Array.isArray(node.children)) convert(node.children);
        if (node.type !== "html" || typeof node.value !== "string") continue;
        const tag = node.value.trim();
        if (!/^<img\b/i.test(tag)) continue;
        const opening = tag.match(/^<img\b[^>]*>/i)?.[0];
        if (!opening) continue;
        const style = attrValue(opening, "style");
        const width = styleWidth(style);
        if (!width) continue;
        nodes[i] = {
          type: "image",
          url: unescapeAttr(attrValue(opening, "src")),
          alt: unescapeAttr(attrValue(opening, "alt")),
          title: unescapeAttr(attrValue(opening, "title")),
          width,
        };
      }
    };
    convert((tree as unknown as { children: MdastNode[] }).children || []);
  };
}

export const remarkImageWidthPlugin = $remark("remarkImageWidth", () => remarkResizedImages());

// Helper shared with parseDOM so the DOM/CSS width is normalized to a px string.
function styleWidthFromCss(value: string): string | null {
  const match = value.match(/([0-9.]+)\s*px/i);
  return match ? match[1] : null;
}
