import { BrowserOpenURL } from "@wails/runtime/runtime";

export function handleMarkdownLinkClick(event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href]");
  if (!link) return false;
  const href = link.getAttribute("href") || "";
  if (!/^(https?:|mailto:)/i.test(href)) return false;
  event.preventDefault();
  event.stopPropagation();
  const runtime = (window as unknown as { runtime?: unknown }).runtime;
  if (runtime) BrowserOpenURL(href);
  else window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
