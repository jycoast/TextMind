// A minimal fullscreen image lightbox for the Markdown preview. Clicking an
// image opens it large; clicking anywhere, pressing Escape, or the close
// button dismisses it. Local images arrive in the preview already hydrated to
// data URLs, so the overlay always has a self-contained source.

interface Lightbox {
  open: (src: string, alt?: string) => void;
  close: () => void;
}

export function createMarkdownLightbox(): Lightbox {
  let overlay: HTMLDivElement | null = null;

  function close(): void {
    if (!overlay) return;
    overlay.removeEventListener("click", onOverlayClick);
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    overlay = null;
  }

  function onOverlayClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest(
      ".tm-lightbox__close",
    );
    if (button) {
      event.stopPropagation();
    }
    close();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }

  function open(src: string, alt?: string): void {
    if (!src) return;
    close();
    overlay = document.createElement("div");
    overlay.className = "tm-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "图片预览");

    const image = document.createElement("img");
    image.className = "tm-lightbox__image";
    image.src = src;
    image.alt = alt || "image";

    const closeButton = document.createElement("button");
    closeButton.className = "tm-lightbox__close";
    closeButton.setAttribute("aria-label", "关闭预览");
    closeButton.textContent = "×";

    overlay.append(image, closeButton);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
  }

  return { open, close };
}
