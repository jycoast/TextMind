import { slashFactory, SlashProvider } from "@milkdown/plugin-slash";
import { commandsCtx } from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/prose/view";
import type { EditorState } from "@milkdown/prose/state";
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand,
} from "@milkdown/preset-commonmark";
import { insertTableCommand } from "@milkdown/preset-gfm";

interface SlashItem {
  title: string;
  hint?: string;
  run: (ctx: Ctx, view: EditorView) => void;
}

// Command payloads are heterogeneous (a heading level, {row,col}, or nothing),
// so the generic key/payload are intentionally passed through `never`: a wrong
// payload fails at runtime (a silent no-op) rather than at compile time, in
// exchange for keeping the menu list terse. The keys are stable exported
// constants from the presets, so drift is unlikely.
function runCommand(
  ctx: Ctx,
  view: EditorView,
  key: unknown,
  payload?: unknown,
): void {
  ctx.get(commandsCtx).call(key as never, payload as never);
  view.focus();
}

const MENU_ITEMS: SlashItem[] = [
  {
    title: "正文",
    hint: "段落",
    run: (ctx, view) => runCommand(ctx, view, turnIntoTextCommand.key),
  },
  ...[1, 2, 3, 4, 5, 6].map<SlashItem>((level) => ({
    title: `标题 ${level}`,
    hint: `H${level}`,
    run: (ctx, view) => runCommand(ctx, view, wrapInHeadingCommand.key, level),
  })),
  {
    title: "无序列表",
    run: (ctx, view) => runCommand(ctx, view, wrapInBulletListCommand.key),
  },
  {
    title: "有序列表",
    run: (ctx, view) => runCommand(ctx, view, wrapInOrderedListCommand.key),
  },
  {
    title: "引用",
    run: (ctx, view) => runCommand(ctx, view, wrapInBlockquoteCommand.key),
  },
  {
    title: "代码块",
    run: (ctx, view) => runCommand(ctx, view, createCodeBlockCommand.key),
  },
  {
    title: "表格（3 × 3）",
    run: (ctx, view) =>
      runCommand(ctx, view, insertTableCommand.key, { row: 3, col: 3 }),
  },
  {
    title: "分隔线",
    run: (ctx, view) => runCommand(ctx, view, insertHrCommand.key),
  },
];

/** A "/" command menu for the WYSIWYG editor. Use with `slashMenuSpec(ctx)`. */
export const slashMenu = slashFactory("TextMindSlash");

/** The PluginSpec to register via `ctx.set(slashMenu.key, spec)`. */
export function slashMenuSpec(ctx: Ctx) {
  // Keyboard navigation state shared by the menu's `view()` and the editor
  // keymap. Kept at spec scope so both closures see the same rows.
  let provider: SlashProvider | null = null;
  let visible = false;
  let activeIndex = -1;
  let rows: HTMLElement[] = [];

  function setActive(index: number): void {
    rows.forEach((row, i) =>
      row.classList.toggle("tm-md-slash__item--active", i === index),
    );
  }

  function hide(): void {
    provider?.hide();
  }

  return {
    view: (view: EditorView) => {
      const content = document.createElement("div");
      content.className = "tm-md-slash";
      const thisProvider: SlashProvider = new SlashProvider({
        content,
        trigger: "/",
        // Only open when the "/" starts the block (ignoring leading space), so
        // prose like "a/b" never summons the menu. The default implementation
        // merely checks the char before the caret is "/", which would also hide
        // the menu as soon as a filter character is typed — this keeps it open
        // while the user narrows the list. (`thisProvider` is only read after
        // construction completes, so the self-reference is safe.)
        shouldShow: (v: EditorView): boolean => {
          const text = thisProvider.getContent(v);
          if (!text) return false;
          return text.trimStart().startsWith("/");
        },
      });
      provider = thisProvider;

      thisProvider.onShow = () => {
        visible = true;
        rows = [];
        const raw = thisProvider.getContent(view) || "";
        const query = raw.trim().replace(/^\/+/, "");
        content.textContent = "";
        const filtered = query
          ? MENU_ITEMS.filter((item) =>
              `${item.title} ${item.hint || ""}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            )
          : MENU_ITEMS;
        if (filtered.length === 0) {
          hide();
          return;
        }
        for (const item of filtered) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "tm-md-slash__item";
          // Keep the editor selection alive while clicking an item.
          row.addEventListener("mousedown", (event) => event.preventDefault());
          row.addEventListener("click", () => {
            item.run(ctx, view);
            hide();
          });
          const title = document.createElement("span");
          title.className = "tm-md-slash__title";
          title.textContent = item.title;
          row.appendChild(title);
          if (item.hint) {
            const hint = document.createElement("span");
            hint.className = "tm-md-slash__hint";
            hint.textContent = item.hint;
            row.appendChild(hint);
          }
          content.appendChild(row);
          rows.push(row);
        }
        activeIndex = 0;
        setActive(activeIndex);
      };
      thisProvider.onHide = () => {
        visible = false;
        activeIndex = -1;
      };

      return {
        update: (v: EditorView, prev?: EditorState) =>
          thisProvider.update(v, prev),
        destroy: () => thisProvider.destroy(),
      };
    },
    props: {
      handleKeyDown(_view: EditorView, event: KeyboardEvent): boolean {
        if (!visible) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (rows.length) {
            activeIndex = (activeIndex + 1) % rows.length;
            setActive(activeIndex);
          }
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (rows.length) {
            activeIndex = (activeIndex - 1 + rows.length) % rows.length;
            setActive(activeIndex);
          }
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (rows[activeIndex]) rows[activeIndex].click();
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          hide();
          return true;
        }
        return false;
      },
    },
  };
}
