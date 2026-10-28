import { usePersistedRef } from "./usePersistedRef";

export type ReadingWidth = "narrow" | "standard" | "wide";

const ORDER: ReadingWidth[] = ["narrow", "standard", "wide"];

/** Persistent reading-width for the Markdown preview content column. */
export function useReadingWidth() {
  const width = usePersistedRef<ReadingWidth>(
    "textmind.markdown.readingWidth",
    "standard",
  );
  const cycle = (): ReadingWidth => {
    const index = ORDER.indexOf(width.value);
    const next = ORDER[(index + 1) % ORDER.length];
    width.value = next;
    return next;
  };
  return { width, cycle };
}
