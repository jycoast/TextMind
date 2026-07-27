import { describe, expect, it } from "vitest";
import { createMarkdownChangeGuard } from "./changeGuard";

describe("Markdown programmatic change guard", () => {
  it("suppresses a delayed callback for a programmatic write", () => {
    const guard = createMarkdownChangeGuard();
    guard.expect("# Loaded\n");
    expect(guard.shouldNotify("# Loaded\n")).toBe(false);
  });

  it("does not suppress a user edit that follows a programmatic write", () => {
    const guard = createMarkdownChangeGuard();
    guard.expect("# Loaded\n");
    expect(guard.shouldNotify("# Loaded and edited\n")).toBe(true);
  });

  it("only consumes the matching programmatic callback once", () => {
    const guard = createMarkdownChangeGuard();
    guard.expect("text\n");
    expect(guard.shouldNotify("text\n")).toBe(false);
    expect(guard.shouldNotify("text\nmore\n")).toBe(true);
  });
});
