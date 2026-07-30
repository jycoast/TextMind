import type { EditorState } from "@milkdown/prose/state";
import { NodeSelection } from "@milkdown/prose/state";
import { redoDepth, undoDepth } from "@milkdown/prose/history";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Columns3,
  createElement as createIconElement,
  Download,
  Image,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
  type IconNode,
} from "lucide";

export type FormattingAction =
  | "undo"
  | "redo"
  | "strong"
  | "emphasis"
  | "strike"
  | "inline-code"
  | "heading"
  | "blockquote"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "link-set"
  | "link-remove"
  | "image-set"
  | "image-remove"
  | "table-insert"
  | "table-add-row-before"
  | "table-add-row-after"
  | "table-add-column-before"
  | "table-add-column-after"
  | "table-delete-row"
  | "table-delete-column"
  | "table-delete"
  | "table-align"
  | "hr"
  | "export-pdf";

export interface ToolbarHandle {
  element: HTMLDivElement;
  update: (state: EditorState) => void;
  destroy: () => void;
}

interface ToolbarState {
  active: Partial<Record<FormattingAction, boolean>>;
  headingLevel: number;
  link: { href: string; title: string } | null;
  image: { src: string; alt: string; title: string } | null;
  inTable: boolean;
  tableAlignment: "left" | "center" | "right" | null;
  inListItem: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

interface ButtonDefinition {
  action: FormattingAction;
  title: string;
  icon: IconNode;
}

const markButtons: ButtonDefinition[] = [
  { action: "strong", title: "加粗 (Ctrl+B)", icon: Bold },
  { action: "emphasis", title: "斜体 (Ctrl+I)", icon: Italic },
  { action: "strike", title: "删除线", icon: Strikethrough },
  { action: "inline-code", title: "行内代码", icon: Code2 },
];

const blockButtons: ButtonDefinition[] = [
  { action: "blockquote", title: "引用", icon: Quote },
  { action: "bullet-list", title: "无序列表", icon: List },
  { action: "ordered-list", title: "有序列表", icon: ListOrdered },
  { action: "task-list", title: "切换任务列表", icon: ListChecks },
];

function markAttrs(
  state: EditorState,
  name: string,
): Record<string, unknown> | null {
  const markType = state.schema.marks[name];
  if (!markType) return null;
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const mark = markType.isInSet(state.storedMarks || $from.marks());
    return mark ? mark.attrs : null;
  }
  let attrs: Record<string, unknown> | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const mark = markType.isInSet(node.marks);
    if (!mark) return true;
    attrs = mark.attrs;
    return false;
  });
  return attrs;
}

function ancestor(state: EditorState, name: string) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === name) return node;
  }
  return null;
}

export function deriveToolbarState(state: EditorState): ToolbarState {
  const linkAttrs = markAttrs(state, "link");
  const selectedNode = state.selection instanceof NodeSelection
    ? state.selection.node
    : null;
  const image = selectedNode?.type.name === "image"
    ? {
        src: String(selectedNode.attrs.src || ""),
        alt: String(selectedNode.attrs.alt || ""),
        title: String(selectedNode.attrs.title || ""),
      }
    : null;
  const heading = ancestor(state, "heading");
  const listItem = ancestor(state, "list_item");
  const cell = ancestor(state, "table_cell") || ancestor(state, "table_header");
  const alignment = cell?.attrs.alignment;

  return {
    active: {
      strong: Boolean(markAttrs(state, "strong")),
      emphasis: Boolean(markAttrs(state, "emphasis")),
      strike: Boolean(markAttrs(state, "strike_through")),
      "inline-code": Boolean(markAttrs(state, "inline_code")),
      blockquote: Boolean(ancestor(state, "blockquote")),
      "bullet-list": Boolean(ancestor(state, "bullet_list")),
      "ordered-list": Boolean(ancestor(state, "ordered_list")),
      "task-list": listItem?.attrs.checked != null,
      "link-set": Boolean(linkAttrs),
      "image-set": Boolean(image),
    },
    headingLevel: Number(heading?.attrs.level || 0),
    link: linkAttrs
      ? {
          href: String(linkAttrs.href || ""),
          title: String(linkAttrs.title || ""),
        }
      : null,
    image,
    inTable: Boolean(ancestor(state, "table")),
    tableAlignment:
      alignment === "center" || alignment === "right" || alignment === "left"
        ? alignment
        : null,
    inListItem: Boolean(listItem),
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
  };
}

function icon(node: IconNode): SVGElement {
  return createIconElement(node, {
    width: 16,
    height: 16,
    "aria-hidden": "true",
    focusable: "false",
  });
}

function separator(): HTMLSpanElement {
  const result = document.createElement("span");
  result.className = "tm-md-toolbar__separator";
  result.setAttribute("aria-hidden", "true");
  return result;
}

function field(label: string, type = "text") {
  const wrapper = document.createElement("label");
  wrapper.className = "tm-md-toolbar__field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.autocomplete = "off";
  wrapper.append(text, input);
  return { wrapper, input };
}

export function createFormattingToolbar(
  execute: (action: FormattingAction, payload?: unknown) => boolean | void,
): ToolbarHandle {
  const element = document.createElement("div");
  element.className = "tm-md-toolbar";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "Markdown 格式工具栏");

  let currentState: ToolbarState | null = null;
  let openPanel: "link" | "image" | "table" | null = null;
  let rovingIndex = 0;
  const controls: HTMLElement[] = [];
  const buttonElements = new Map<FormattingAction, HTMLButtonElement[]>();
  const panels = new Map<string, HTMLElement>();
  const triggers = new Map<string, HTMLButtonElement>();

  const registerControl = <T extends HTMLElement>(control: T): T => {
    control.classList.add("tm-md-toolbar__control");
    control.tabIndex = controls.length === 0 ? 0 : -1;
    controls.push(control);
    control.addEventListener("focus", () => {
      rovingIndex = controls.indexOf(control);
      controls.forEach((item, index) => { item.tabIndex = index === rovingIndex ? 0 : -1; });
    });
    return control;
  };

  const addButton = (
    definition: ButtonDefinition,
    onClick: () => void = () => { execute(definition.action); },
  ) => {
    const button = registerControl(document.createElement("button"));
    button.type = "button";
    button.classList.add("tm-md-toolbar__button");
    button.title = definition.title;
    button.setAttribute("aria-label", definition.title);
    button.setAttribute("aria-pressed", "false");
    button.appendChild(icon(definition.icon));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", onClick);
    element.appendChild(button);
    const actionButtons = buttonElements.get(definition.action) || [];
    actionButtons.push(button);
    buttonElements.set(definition.action, actionButtons);
    return button;
  };

  const closePanels = (restoreFocus = false) => {
    const previous = openPanel;
    openPanel = null;
    for (const [name, panel] of panels) {
      panel.hidden = true;
      triggers.get(name)?.setAttribute("aria-expanded", "false");
    }
    if (restoreFocus && previous) triggers.get(previous)?.focus();
  };

  const togglePanel = (name: "link" | "image" | "table") => {
    const shouldOpen = openPanel !== name;
    closePanels();
    if (!shouldOpen) return;
    openPanel = name;
    const panel = panels.get(name);
    const trigger = triggers.get(name);
    if (panel) panel.hidden = false;
    trigger?.setAttribute("aria-expanded", "true");
  };

  addButton({ action: "undo", title: "撤销 (Ctrl+Z)", icon: Undo2 });
  addButton({ action: "redo", title: "重做 (Ctrl+Y)", icon: Redo2 });
  element.appendChild(separator());

  const heading = registerControl(document.createElement("select"));
  heading.classList.add("tm-md-toolbar__select");
  heading.title = "段落与标题级别";
  heading.setAttribute("aria-label", "段落与标题级别");
  const headingOptions = [
    ["0", "正文"], ["1", "H1"], ["2", "H2"], ["3", "H3"],
    ["4", "H4"], ["5", "H5"], ["6", "H6"],
  ];
  for (const [value, label] of headingOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    heading.appendChild(option);
  }
  heading.addEventListener("change", () => execute("heading", Number(heading.value)));
  element.appendChild(heading);

  for (const definition of markButtons) addButton(definition);
  element.appendChild(separator());
  for (const definition of blockButtons) addButton(definition);
  element.appendChild(separator());

  const linkPanel = document.createElement("form");
  linkPanel.className = "tm-md-toolbar__popover tm-md-toolbar__popover--form";
  linkPanel.id = `tm-md-link-${crypto.randomUUID()}`;
  linkPanel.hidden = true;
  linkPanel.setAttribute("aria-label", "链接属性");
  const linkUrl = field("地址", "url");
  const linkTitle = field("标题（可选）");
  const linkActions = document.createElement("div");
  linkActions.className = "tm-md-toolbar__actions";
  const unlinkButton = document.createElement("button");
  unlinkButton.type = "button";
  unlinkButton.className = "tm-md-toolbar__text-button tm-md-toolbar__text-button--danger";
  unlinkButton.textContent = "取消链接";
  const applyLink = document.createElement("button");
  applyLink.type = "submit";
  applyLink.className = "tm-md-toolbar__text-button is-primary";
  applyLink.textContent = "应用";
  linkActions.append(unlinkButton, applyLink);
  linkPanel.append(linkUrl.wrapper, linkTitle.wrapper, linkActions);
  panels.set("link", linkPanel);

  const linkTrigger = addButton(
    { action: "link-set", title: "插入或编辑链接", icon: Link2 },
    () => {
      const state = currentState?.link;
      linkUrl.input.value = state?.href || "https://";
      linkTitle.input.value = state?.title || "";
      unlinkButton.disabled = !state;
      togglePanel("link");
      if (openPanel === "link") queueMicrotask(() => linkUrl.input.select());
    },
  );
  linkTrigger.setAttribute("aria-haspopup", "dialog");
  linkTrigger.setAttribute("aria-expanded", "false");
  linkTrigger.setAttribute("aria-controls", linkPanel.id);
  triggers.set("link", linkTrigger);
  element.appendChild(linkPanel);
  linkPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const href = linkUrl.input.value.trim();
    if (!href) { linkUrl.input.focus(); return; }
    execute("link-set", {
      href,
      title: linkTitle.input.value.trim(),
      update: Boolean(currentState?.link),
    });
    closePanels();
  });
  unlinkButton.addEventListener("click", () => {
    execute("link-remove");
    closePanels();
  });

  const imagePanel = document.createElement("form");
  imagePanel.className = "tm-md-toolbar__popover tm-md-toolbar__popover--form";
  imagePanel.id = `tm-md-image-${crypto.randomUUID()}`;
  imagePanel.hidden = true;
  imagePanel.setAttribute("aria-label", "图片属性");
  const imageUrl = field("图片地址", "url");
  const imageAlt = field("替代文本");
  const imageTitle = field("标题（可选）");
  const imageActions = document.createElement("div");
  imageActions.className = "tm-md-toolbar__actions";
  const removeImage = document.createElement("button");
  removeImage.type = "button";
  removeImage.className = "tm-md-toolbar__text-button tm-md-toolbar__text-button--danger";
  removeImage.textContent = "删除图片";
  const applyImage = document.createElement("button");
  applyImage.type = "submit";
  applyImage.className = "tm-md-toolbar__text-button is-primary";
  applyImage.textContent = "应用";
  imageActions.append(removeImage, applyImage);
  imagePanel.append(imageUrl.wrapper, imageAlt.wrapper, imageTitle.wrapper, imageActions);
  panels.set("image", imagePanel);

  const imageTrigger = addButton(
    { action: "image-set", title: "插入或编辑图片", icon: Image },
    () => {
      const state = currentState?.image;
      imageUrl.input.value = state?.src || "";
      imageAlt.input.value = state?.alt || "";
      imageTitle.input.value = state?.title || "";
      removeImage.disabled = !state;
      togglePanel("image");
      if (openPanel === "image") queueMicrotask(() => imageUrl.input.focus());
    },
  );
  imageTrigger.setAttribute("aria-haspopup", "dialog");
  imageTrigger.setAttribute("aria-expanded", "false");
  imageTrigger.setAttribute("aria-controls", imagePanel.id);
  triggers.set("image", imageTrigger);
  element.appendChild(imagePanel);
  imagePanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const src = imageUrl.input.value.trim();
    if (!src) { imageUrl.input.focus(); return; }
    execute("image-set", {
      src,
      alt: imageAlt.input.value.trim(),
      title: imageTitle.input.value.trim(),
      update: Boolean(currentState?.image),
    });
    closePanels();
  });
  removeImage.addEventListener("click", () => {
    execute("image-remove");
    closePanels();
  });

  const tablePanel = document.createElement("div");
  tablePanel.className = "tm-md-toolbar__popover tm-md-toolbar__table-menu";
  tablePanel.id = `tm-md-table-${crypto.randomUUID()}`;
  tablePanel.hidden = true;
  tablePanel.setAttribute("role", "menu");
  tablePanel.setAttribute("aria-label", "表格操作");
  panels.set("table", tablePanel);
  const tableTrigger = addButton(
    { action: "table-insert", title: "插入或编辑表格", icon: Table2 },
    () => togglePanel("table"),
  );
  tableTrigger.setAttribute("aria-haspopup", "menu");
  tableTrigger.setAttribute("aria-expanded", "false");
  tableTrigger.setAttribute("aria-controls", tablePanel.id);
  triggers.set("table", tableTrigger);

  const tableItems: Array<[FormattingAction, string, IconNode, unknown?]> = [
    ["table-insert", "插入 3 x 3 表格", Table2],
    ["table-add-row-before", "在上方添加行", Rows3],
    ["table-add-row-after", "在下方添加行", Rows3],
    ["table-add-column-before", "在左侧添加列", Columns3],
    ["table-add-column-after", "在右侧添加列", Columns3],
    ["table-delete-row", "删除当前行", Trash2],
    ["table-delete-column", "删除当前列", Trash2],
    ["table-delete", "删除表格", Trash2],
    ["table-align", "左对齐", AlignLeft, "left"],
    ["table-align", "居中对齐", AlignCenter, "center"],
    ["table-align", "右对齐", AlignRight, "right"],
  ];
  const tableContextItems: HTMLButtonElement[] = [];
  const allTableItems: HTMLButtonElement[] = [];
  let insertTableItem: HTMLButtonElement | null = null;
  for (const [action, label, iconNode, payload] of tableItems) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "tm-md-toolbar__menu-item";
    item.setAttribute("role", "menuitem");
    item.append(icon(iconNode), document.createTextNode(label));
    item.addEventListener("mousedown", (event) => event.preventDefault());
    item.addEventListener("click", () => {
      execute(action, payload);
      closePanels();
    });
    tablePanel.appendChild(item);
    allTableItems.push(item);
    if (action === "table-insert") insertTableItem = item;
    else tableContextItems.push(item);
    if (action === "table-align") {
      const buttons = buttonElements.get(action) || [];
      buttons.push(item);
      buttonElements.set(action, buttons);
      item.dataset.alignment = String(payload);
    }
  }
  tablePanel.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const available = allTableItems.filter((item) => !item.disabled);
    if (available.length === 0) return;
    event.preventDefault();
    const current = available.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? available.length - 1
        : event.key === "ArrowDown"
          ? (current + 1 + available.length) % available.length
          : (current - 1 + available.length) % available.length;
    available[next]?.focus();
  });
  element.appendChild(tablePanel);
  addButton({ action: "hr", title: "插入分隔线", icon: Minus });
  element.appendChild(separator());
  addButton({ action: "export-pdf", title: "导出为 PDF", icon: Download });

  const onToolbarKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && openPanel) {
      event.preventDefault();
      closePanels(true);
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.classList.contains("tm-md-toolbar__control")) return;
    let next = rovingIndex;
    if (event.key === "ArrowRight") next = (rovingIndex + 1) % controls.length;
    else if (event.key === "ArrowLeft") next = (rovingIndex - 1 + controls.length) % controls.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else return;
    event.preventDefault();
    controls[next]?.focus();
  };
  element.addEventListener("keydown", onToolbarKeydown);

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (openPanel && !element.contains(event.target as Node)) closePanels();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown);

  return {
    element,
    update(state) {
      currentState = deriveToolbarState(state);
      for (const [action, buttons] of buttonElements) {
        for (const button of buttons) {
          const pressed = action === "table-align"
            ? button.dataset.alignment === currentState.tableAlignment
            : Boolean(currentState.active[action]);
          button.classList.toggle("is-active", pressed);
          button.setAttribute("aria-pressed", String(pressed));
        }
      }
      heading.value = String(currentState.headingLevel);
      const taskButton = buttonElements.get("task-list")?.[0];
      if (taskButton) {
        taskButton.disabled = !currentState.inListItem;
        taskButton.setAttribute("aria-disabled", String(!currentState.inListItem));
      }
      const undoButton = buttonElements.get("undo")?.[0];
      const redoButton = buttonElements.get("redo")?.[0];
      if (undoButton) {
        undoButton.disabled = !currentState.canUndo;
        undoButton.setAttribute("aria-disabled", String(!currentState.canUndo));
      }
      if (redoButton) {
        redoButton.disabled = !currentState.canRedo;
        redoButton.setAttribute("aria-disabled", String(!currentState.canRedo));
      }
      if (insertTableItem) {
        insertTableItem.disabled = currentState.inTable;
        insertTableItem.setAttribute("aria-disabled", String(currentState.inTable));
        insertTableItem.title = currentState.inTable
          ? "请先将光标移出当前表格"
          : "插入 3 x 3 表格";
      }
      for (const item of tableContextItems) {
        item.disabled = !currentState.inTable;
        item.setAttribute("aria-disabled", String(!currentState.inTable));
        item.title = currentState.inTable
          ? ""
          : "请先将光标置于表格单元格内";
      }
      unlinkButton.disabled = !currentState.link;
      removeImage.disabled = !currentState.image;
    },
    destroy() {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      element.removeEventListener("keydown", onToolbarKeydown);
    },
  };
}
