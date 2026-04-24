export type JsonFormatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function tryFormatJson(input: string, indent = 2): JsonFormatResult {
  try {
    const obj = JSON.parse(input);
    return { ok: true, text: JSON.stringify(obj, null, indent) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}

export function tryMinifyJson(input: string): JsonFormatResult {
  try {
    const obj = JSON.parse(input);
    return { ok: true, text: JSON.stringify(obj) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) };
  }
}
