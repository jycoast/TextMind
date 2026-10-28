import { afterEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { editorRegistry } from "@/plugins/core/EditorRegistry";
import type { EditorAdapter } from "@/types";
import { useTabsStore } from "./tabs";

const registrations: Array<{ dispose(): void }> = [];

function fakeAdapter(id: string): EditorAdapter & { writes: string[] } {
  let value = "";
  const writes: string[] = [];
  return {
    id,
    mode: id === "monaco" ? "monaco" : "textarea",
    supportsColumnMode: false,
    writes,
    getValue: () => value,
    setValue: (next) => { value = next; writes.push(next); },
    getViewState: () => null,
    setViewState: () => {},
    setLanguage: () => {},
    setTheme: () => {},
    getSelectionText: () => "",
    replaceSelection: () => false,
    focus: () => {},
    onChange: () => {},
    onContextMenu: () => {},
    onSelectionsChange: () => {},
    setColumnMode: () => false,
    getCursorPosition: () => ({ line: 1, column: 1 }),
    getSelectionStats: () => ({ hasSelection: false, lineCount: 0, charCount: 0, byteCount: 0 }),
    onCursorChange: () => {},
    forceRefresh: () => {},
    dispose: () => {},
  };
}

afterEach(() => {
  for (const registration of registrations.splice(0)) registration.dispose();
});

describe("tab editor handoff", () => {
  it("does not feed an already opened Markdown tab into the previous text editor", () => {
    registrations.push(editorRegistry.register("test", {
      id: "monaco", displayName: "Text", priority: 0,
      match: () => true, factory: () => fakeAdapter("monaco"),
    }));
    registrations.push(editorRegistry.register("test", {
      id: "milkdown", displayName: "Markdown", priority: 10,
      match: (tab) => tab.language === "markdown", factory: () => fakeAdapter("milkdown"),
    }));
    setActivePinia(createPinia());
    const tabs = useTabsStore();
    tabs.tabs[0].text = "plain text";
    const textEditor = fakeAdapter("monaco");
    tabs.setAdapter(textEditor);
    tabs.addTabFromText("notes.md", "# Original", "markdown");
    // Switch again before the editor host's watcher has attached Milkdown.
    tabs.selectTab(0);
    tabs.selectTab(1);
    expect(tabs.current?.text).toBe("# Original");
    const markdownEditor = fakeAdapter("milkdown");
    tabs.setAdapter(markdownEditor);

    tabs.selectTab(0);
    expect(markdownEditor.writes).toEqual(["# Original"]);
    tabs.setAdapter(textEditor);
    tabs.selectTab(1);

    expect(textEditor.writes).toEqual(["plain text", "plain text", "plain text"]);
    expect(markdownEditor.writes).toEqual(["# Original"]);
    expect(tabs.current?.text).toBe("# Original");
  });
});
