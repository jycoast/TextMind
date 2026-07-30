export interface MarkdownQualityReport {
  wordCount: number;
  readingMinutes: number;
  warnings: string[];
}

export function analyzeMarkdownQuality(source: string): MarkdownQualityReport {
  const text = String(source || "");
  const withoutCode = text.replace(/```[\s\S]*?```|`[^`\r\n]*`/g, " ");
  const cjkCount = (withoutCode.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  const latinCount = (withoutCode.match(/[\p{L}\p{N}]+/gu) || [])
    .filter((token) => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token))
    .length;
  const wordCount = cjkCount + latinCount;
  const warnings: string[] = [];

  const headings = new Map<string, number>();
  for (const match of withoutCode.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const heading = match[1]?.trim().toLocaleLowerCase() || "";
    if (!heading) continue;
    headings.set(heading, (headings.get(heading) || 0) + 1);
  }
  const duplicates = [...headings.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    warnings.push(`存在 ${duplicates.length} 个重复标题`);
  }

  const missingAlt = [...withoutCode.matchAll(/!\[([^\]]*)\]\([^\r\n)]+\)/g)]
    .filter((match) => !match[1]?.trim()).length;
  if (missingAlt > 0) warnings.push(`有 ${missingAlt} 张图片缺少替代文本`);

  return {
    wordCount,
    readingMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 300)) : 0,
    warnings,
  };
}
