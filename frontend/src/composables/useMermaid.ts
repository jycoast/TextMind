import type { ObjectDirective } from "vue";
import { handleMarkdownLinkClick } from "./markdownLinks";

let renderSequence = 0;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let themeObserver: MutationObserver | null = null;
const themeHandlers = new Set<() => void>();

function isLightTheme(): boolean {
  const theme = document.body.dataset.theme || "dark";
  return theme === "light" || theme === "parchment";
}

function ensureThemeObserver(): void {
  if (themeObserver || typeof MutationObserver === "undefined") return;
  themeObserver = new MutationObserver(() => {
    document
      .querySelectorAll<HTMLElement>(".tm-mermaid")
      .forEach((diagram) => {
        diagram.dataset.mermaidState = "pending";
      });
    void renderMermaidElements(document);
    themeHandlers.forEach((handler) => handler());
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      return mermaid;
    });
  }
  return mermaidPromise;
}

export async function renderMermaidSvg(source: string): Promise<string> {
  ensureThemeObserver();
  const mermaid = await getMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: isLightTheme() ? "default" : "dark",
  });
  renderSequence += 1;
  const { svg } = await mermaid.render(`tm-mermaid-${renderSequence}`, source);
  return svg;
}

export async function renderMermaidElements(root: ParentNode): Promise<void> {
  const diagrams = root.querySelectorAll<HTMLElement>(
    '.tm-mermaid[data-mermaid-state="pending"]',
  );
  await Promise.all(
    Array.from(diagrams, async (diagram) => {
      const sourceElement = diagram.querySelector<HTMLElement>(
        ".tm-mermaid__source",
      );
      const output = diagram.querySelector<HTMLElement>(
        ".tm-mermaid__output",
      );
      if (!sourceElement || !output) return;
      diagram.dataset.mermaidState = "rendering";
      try {
        output.innerHTML = await renderMermaidSvg(
          sourceElement.textContent || "",
        );
        diagram.dataset.mermaidState = "rendered";
      } catch (err) {
        diagram.dataset.mermaidState = "error";
        output.textContent = err instanceof Error
          ? `Mermaid: ${err.message}`
          : "Mermaid 图表语法无效";
      }
    }),
  );
}

function scheduleRender(element: HTMLElement): void {
  ensureThemeObserver();
  queueMicrotask(() => void renderMermaidElements(element));
}

function onMarkdownClick(event: Event): void {
  handleMarkdownLinkClick(event as MouseEvent);
}

export function onMermaidThemeChange(handler: () => void): () => void {
  ensureThemeObserver();
  themeHandlers.add(handler);
  return () => themeHandlers.delete(handler);
}

export const vMermaid: ObjectDirective<HTMLElement> = {
  mounted(element) {
    element.addEventListener("click", onMarkdownClick);
    scheduleRender(element);
  },
  updated: scheduleRender,
  unmounted(element) {
    element.removeEventListener("click", onMarkdownClick);
  },
};
