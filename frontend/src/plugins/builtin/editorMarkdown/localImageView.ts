import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { NodeView } from "@milkdown/prose/view";
import {
  isRelativeMarkdownReference,
  resolveLocalMarkdownImageSource,
} from "@/composables/markdownResources";

function createImageNodeView(
  initialNode: ProseNode,
  documentPath: string,
): NodeView {
  let node = initialNode;
  let revision = 0;
  const image = document.createElement("img");

  function updateAttributes(): void {
    const source = String(node.attrs.src || "");
    image.alt = String(node.attrs.alt || "");
    image.title = String(node.attrs.title || "");
    image.dataset.tmOriginalSrc = source;
    image.classList.remove("tm-markdown-image--missing");
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

  updateAttributes();
  return {
    dom: image,
    update(updatedNode) {
      if (updatedNode.type.name !== "image") return false;
      node = updatedNode;
      updateAttributes();
      return true;
    },
    // The displayed data URL is view-only. Never let ProseMirror parse it
    // back into the image node's Markdown `src` attribute.
    ignoreMutation: () => true,
    destroy() {
      revision += 1;
    },
  };
}

export function createLocalImageView(documentPath: string) {
  return $prose(() =>
    new Plugin({
      props: {
        nodeViews: {
          image: (node) => createImageNodeView(node as ProseNode, documentPath),
        },
      },
    }),
  );
}
