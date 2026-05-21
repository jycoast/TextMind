import { reactive } from "vue";
import type { Component } from "vue";
import type { Disposable, ModalSpec } from "./types";

export interface ActiveModal {
  id: string;
  component: Component;
  props: Record<string, unknown>;
  onClose?: () => void;
}

class ModalLayer {
  readonly modals = reactive<Map<string, ActiveModal>>(new Map());

  open(spec: ModalSpec): Disposable {
    this.modals.set(spec.id, {
      id: spec.id,
      component: spec.component,
      props: spec.props || {},
      onClose: spec.onClose,
    });
    return { dispose: () => this.close(spec.id) };
  }

  close(id: string): void {
    const m = this.modals.get(id);
    if (!m) return;
    this.modals.delete(id);
    try {
      m.onClose?.();
    } catch (err) {
      console.error("[modal] close handler error:", err);
    }
  }

  closeAll(): void {
    const ids = Array.from(this.modals.keys());
    for (const id of ids) this.close(id);
  }

  /** Top-most modal (last opened). */
  top(): ActiveModal | null {
    let last: ActiveModal | null = null;
    for (const m of this.modals.values()) last = m;
    return last;
  }

  list(): ActiveModal[] {
    return Array.from(this.modals.values());
  }
}

export const modalLayer = new ModalLayer();
