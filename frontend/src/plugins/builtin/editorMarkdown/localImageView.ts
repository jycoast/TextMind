import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { NodeView, EditorView } from "@milkdown/prose/view";
import {
  isRelativeMarkdownReference,
  resolveLocalMarkdownImageSource,
} from "@/composables/markdownResources";

function createImageNodeView(
  initialNode: ProseNode,
  documentPath: string,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let node = initialNode;
  let revision = 0;

  // The image is wrapped so a resize handle can sit in its corner without
  // being part of the atomic image node itself (the node has no contentDOM).
  const wrapper = document.createElement("div");
  wrapper.className = "tm-md-image-node";
  const image = document.createElement("img");
  const handle = document.createElement("div");
  handle.className = "tm-md-image-node__handle";
  handle.setAttribute("contenteditable", "false");
  handle.setAttribute("role", "slider");
  handle.setAttribute("aria-label", "拖动调整图片宽度");
  handle.tabIndex = -1;
  wrapper.append(image, handle);

  // The width is stored on the node (persisted via imageResize.ts); reflect it
  // onto the rendered <img>. `node.attrs.width` is a px string or null.
  function applyWidth(): void {
    const width = node.attrs.width as string | null;
    if (width) {
      image.style.width = `${width}px`;
      image.style.height = "auto";
      image.style.maxWidth = "100%";
      handle.setAttribute("aria-valuenow", width);
    } else {
      image.style.removeProperty("width");
      image.style.removeProperty("height");
      handle.removeAttribute("aria-valuenow");
    }
  }

  function updateAttributes(): void {
    const source = String(node.attrs.src || "");
    image.alt = String(node.attrs.alt || "");
    image.title = String(node.attrs.title || "");
    image.dataset.tmOriginalSrc = source;
    image.classList.remove("tm-markdown-image--missing");
    applyWidth();
    revision += 1;
    const currentRevision = revision;

    if (!documentPath || !isRelativeMarkdownReference(source)) {
      image.src = source;
      return;
    }
    image.removeAttribute("src");
    void resolveLocalMarkdownImageSource(documentPath, source)
      .then((dataUrl) => {
        if (revision !== currentRevision) return;
        image.src = dataUrl;
      })
      .catch((error) => {
        if (revision !== currentRevision) return;
        image.classList.add("tm-markdown-image--missing");
        image.title = error instanceof Error ? error.message : "无法加载本地图片";
      });
  }

  // Persist a width onto the image node. Called once at drag-end (and on
  // keyboard nudge) so a resize is a single transaction, not one per pixel.
  function commitWidth(width: number): void {
    const pos = getPos();
    if (pos == null) return;
    const px = String(Math.round(width));
    if (String(node.attrs.width) === px) return;
    try {
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          width: px,
        }),
      );
    } catch (err) {
      console.warn("[milkdown] persist image width:", err);
    }
  }

  let resizing = false;
  let startX = 0;
  let startWidth = 0;
  let lastWidth = 0;
  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizing = true;
    startX = event.clientX;
    startWidth =
      image.getBoundingClientRect().width ||
      image.naturalWidth ||
      Number(node.attrs.width) ||
      120;
    lastWidth = startWidth;
    handle.classList.add("is-dragging");
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", stopResize);
  };
  const onResizeMove = (event: PointerEvent) => {
    if (!resizing) return;
    const width = Math.max(24, Math.round(startWidth + event.clientX - startX));
    lastWidth = width;
    // Smooth live feedback during the drag; only the drag-end is persisted.
    image.style.width = `${width}px`;
    image.style.height = "auto";
    image.style.maxWidth = "100%";
    handle.setAttribute("aria-valuenow", String(width));
  };
  const stopResize = () => {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", stopResize);
    commitWidth(lastWidth);
  };
  handle.addEventListener("pointerdown", startResize);
  // Keep the corner handle from stealing focus / selection from the editor.
  const swallowMousedown = (event: MouseEvent) => event.stopPropagation();
  handle.addEventListener("mousedown", swallowMousedown);
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = image.getBoundingClientRect().width || image.naturalWidth || 120;
    commitWidth(current + (event.key === "ArrowRight" ? 8 : -8));
  });

  updateAttributes();
  return {
    dom: wrapper,
    update(updatedNode) {
      if (updatedNode.type.name !== "image") return false;
      node = updatedNode;
      updateAttributes();
      return true;
    },
    // The displayed data URL is view-only. Never let ProseMirror parse it back
    // into the image node's Markdown `src` attribute.
    ignoreMutation: () => true,
    destroy() {
      revision += 1;
      stopResize();
      handle.removeEventListener("pointerdown", startResize);
      handle.removeEventListener("mousedown", swallowMousedown);
    },
  };
}

export function createLocalImageView(documentPath: string) {
  return $prose(() =>
    new Plugin({
      props: {
        nodeViews: {
          image: (node, view, getPos) =>
            createImageNodeView(node as ProseNode, documentPath, view, getPos),
        },
      },
    }),
  );
}
