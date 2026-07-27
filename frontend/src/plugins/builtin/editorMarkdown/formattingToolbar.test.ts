import { Schema } from "@milkdown/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/prose/state";
import { describe, expect, it } from "vitest";
import { deriveToolbarState } from "./formattingToolbar";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { group: "block", content: "inline*" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
    },
    image: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
        src: { default: "" },
        alt: { default: "" },
        title: { default: "" },
      },
    },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: {
      content: "paragraph+",
      attrs: { checked: { default: null } },
    },
    table: { group: "block", content: "table_row+" },
    table_row: { content: "table_cell+" },
    table_cell: {
      content: "paragraph+",
      attrs: { alignment: { default: null } },
    },
  },
  marks: {
    strong: {},
    emphasis: {},
    strike_through: {},
    inline_code: {},
    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
    },
  },
});

describe("deriveToolbarState", () => {
  it("reports H4-H6 and link attributes", () => {
    const link = schema.marks.link.create({ href: "/guide", title: "Guide" });
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 6 }, [schema.text("linked", [link])]),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 1, 3),
    });

    const toolbar = deriveToolbarState(state);
    expect(toolbar.headingLevel).toBe(6);
    expect(toolbar.link).toEqual({ href: "/guide", title: "Guide" });
    expect(toolbar.active["link-set"]).toBe(true);
  });

  it("reads the selected image properties", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.node("image", { src: "a.png", alt: "A", title: "Image A" }),
      ]),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 1),
    });

    expect(deriveToolbarState(state).image).toEqual({
      src: "a.png",
      alt: "A",
      title: "Image A",
    });
  });

  it("detects task list and table context", () => {
    const taskDoc = schema.node("doc", null, [
      schema.node("bullet_list", null, [
        schema.node("list_item", { checked: false }, [
          schema.node("paragraph", null, [schema.text("todo")]),
        ]),
      ]),
    ]);
    const taskState = EditorState.create({
      schema,
      doc: taskDoc,
      selection: TextSelection.create(taskDoc, 3),
    });
    expect(deriveToolbarState(taskState).active["task-list"]).toBe(true);

    const tableDoc = schema.node("doc", null, [
      schema.node("table", null, [
        schema.node("table_row", null, [
          schema.node("table_cell", { alignment: "center" }, [
            schema.node("paragraph", null, [schema.text("cell")]),
          ]),
        ]),
      ]),
    ]);
    const tableState = EditorState.create({
      schema,
      doc: tableDoc,
      selection: TextSelection.create(tableDoc, 4),
    });
    expect(deriveToolbarState(tableState).inTable).toBe(true);
    expect(deriveToolbarState(tableState).tableAlignment).toBe("center");
  });
});
