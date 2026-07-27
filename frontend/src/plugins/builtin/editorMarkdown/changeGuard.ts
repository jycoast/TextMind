export interface MarkdownChangeGuard {
  expect: (markdown: string) => void;
  shouldNotify: (markdown: string) => boolean;
}

/** Distinguishes Milkdown's debounced programmatic updates from user edits. */
export function createMarkdownChangeGuard(): MarkdownChangeGuard {
  let expectedMarkdown: string | null = null;

  return {
    expect(markdown) {
      expectedMarkdown = markdown;
    },
    shouldNotify(markdown) {
      if (expectedMarkdown === null) return true;
      const isProgrammatic = markdown === expectedMarkdown;
      expectedMarkdown = null;
      return !isProgrammatic;
    },
  };
}
