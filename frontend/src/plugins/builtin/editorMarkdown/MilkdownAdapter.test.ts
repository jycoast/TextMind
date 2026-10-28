// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createMilkdownAdapter } from "./MilkdownAdapter";

afterEach(() => document.body.replaceChildren());

describe("Milkdown editor tab lifecycle", () => {
  it("finishes pending serialization when switching away after opening a document", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createMilkdownAdapter({ host, initialTheme: "dark" });
    const source = "# Notes\n\nA paragraph with **formatting**.\n";
    editor.setValue(source);

    const deadline = Date.now() + 5000;
    while (editor.getViewState() === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(editor.getViewState()).not.toBeNull();
    expect(editor.getValue()).toBe(source);

    editor.setValue("# Revised\n\nNew paragraph.\n");
    editor.dispose();
    // Milkdown's listener runs 200 ms after a document transaction. Any
    // serialization after its context is destroyed fails asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }, 10000);
});
