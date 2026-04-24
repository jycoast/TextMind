export function colLettersToIndex(letters: string): number {
  const s = String(letters || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function parseTabular(text: string): string[][] {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line) => line.split("\t"));
}

export function expandTemplate(
  template: string,
  row: string[],
  rowIndex: number,
): string {
  return String(template).replace(
    /\{\{\s*([A-Za-z]+|ROW)\s*\}\}/g,
    (_match, token) => {
      const key = String(token).toUpperCase();
      if (key === "ROW") return String(rowIndex + 1);
      const idx = colLettersToIndex(key);
      if (idx < 0 || idx >= row.length) {
        throw new Error(`第 ${rowIndex + 1} 行缺少列 ${key}`);
      }
      return row[idx] ?? "";
    },
  );
}

export function generateBatchSql(
  dataText: string,
  templateText: string,
): string {
  const tpl = String(templateText || "");
  if (!tpl.trim()) throw new Error("模板不能为空");
  const rows = parseTabular(dataText);
  if (rows.length === 0) throw new Error("数据不能为空");
  return rows.map((row, i) => expandTemplate(tpl, row, i)).join("\n");
}
