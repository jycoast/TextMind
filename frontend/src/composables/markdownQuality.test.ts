import { describe, expect, it } from "vitest";
import { analyzeMarkdownQuality } from "./markdownQuality";

describe("Markdown quality report", () => {
  it("counts mixed-language prose and estimates reading time", () => {
    const report = analyzeMarkdownQuality("# 标题\n\nHello world 你好");
    expect(report.wordCount).toBe(6);
    expect(report.readingMinutes).toBe(1);
  });

  it("reports duplicate headings and missing image alt text", () => {
    const report = analyzeMarkdownQuality("# Demo\n\n## Demo\n\n![](image.png)");
    expect(report.warnings).toEqual([
      "存在 1 个重复标题",
      "有 1 张图片缺少替代文本",
    ]);
  });

  it("ignores headings and images inside fenced code", () => {
    const report = analyzeMarkdownQuality("```md\n# Demo\n![](x.png)\n```");
    expect(report.warnings).toEqual([]);
  });
});
