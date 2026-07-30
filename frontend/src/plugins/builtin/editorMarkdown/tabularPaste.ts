function escapeCell(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

/** Convert a rectangular Excel/TSV clipboard payload to a GFM table. */
export function tabularTextToMarkdown(text: string): string | null {
  const source = String(text || "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!source.includes("\t")) return null;
  const rows = source.split("\n").map((line) => line.split("\t"));
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((row) => row.length));
  if (width < 2) return null;
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index] || "")),
  );
  const line = (row: string[]) => `| ${row.join(" | ")} |`;
  return [
    line(normalized[0]),
    line(Array.from({ length: width }, () => "---")),
    ...normalized.slice(1).map(line),
  ].join("\n");
}
