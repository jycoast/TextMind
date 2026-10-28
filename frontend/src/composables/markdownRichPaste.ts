import TurndownService from "turndown";

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  // Keep GFM-ish tables when pasting spreadsheet-like HTML.
  td.addRule("textmind-table", {
    filter: "table",
    replacement: (content) => `\n\n${content}\n\n`,
  });
  service = td;
  return td;
}

/**
 * Convert pasted rich-text HTML into clean Markdown. Returns an empty string
 * when the HTML carries no meaningful content. Relative/plain links and local
 * image srcs are preserved so they keep working in the notes workspace.
 */
export function richHtmlToMarkdown(html: string): string {
  if (!html) return "";
  try {
    const markdown = getService()
      .turndown(html)
      .replace(/^\n+|\n+$/g, "");
    // Collapse the doc to nothing if it produced only whitespace/escapes.
    return markdown.trim() ? markdown : "";
  } catch {
    return "";
  }
}
