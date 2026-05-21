import { reactive } from "vue";
import type { Disposable, EditorRegistration } from "./types";
import type { EditorAdapter, Tab } from "@/types";

interface EditorRecord extends EditorRegistration {
  pluginId: string;
}

class EditorRegistry {
  private readonly editors = reactive(new Map<string, EditorRecord>());
  private readonly attachListeners: Array<(adapter: EditorAdapter) => void> = [];

  register(pluginId: string, reg: EditorRegistration): Disposable {
    if (this.editors.has(reg.id)) {
      throw new Error(`Editor already registered: ${reg.id}`);
    }
    this.editors.set(reg.id, { ...reg, pluginId });
    return {
      dispose: () => {
        const rec = this.editors.get(reg.id);
        if (rec && rec.pluginId === pluginId) this.editors.delete(reg.id);
      },
    };
  }

  list(): EditorRecord[] {
    return Array.from(this.editors.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }

  get(id: string): EditorRecord | undefined {
    return this.editors.get(id);
  }

  /**
   * Pick the best editor for the tab. Honors tab.editorId override when set
   * and the editor still exists; otherwise picks the highest-priority match.
   */
  pickFor(tab: Tab): EditorRecord | null {
    const overrideId = (tab as Tab & { editorId?: string }).editorId;
    if (overrideId) {
      const override = this.editors.get(overrideId);
      if (override && override.match(tab)) return override;
    }
    let best: EditorRecord | null = null;
    for (const rec of this.editors.values()) {
      if (!rec.match(tab)) continue;
      if (!best || rec.priority > best.priority) best = rec;
    }
    return best;
  }

  onEditorAttached(handler: (adapter: EditorAdapter) => void): Disposable {
    this.attachListeners.push(handler);
    return {
      dispose: () => {
        const i = this.attachListeners.indexOf(handler);
        if (i >= 0) this.attachListeners.splice(i, 1);
      },
    };
  }

  emitAttached(adapter: EditorAdapter): void {
    for (const fn of this.attachListeners) {
      try {
        fn(adapter);
      } catch (err) {
        console.error("[editor] attach listener error:", err);
      }
    }
  }
}

export const editorRegistry = new EditorRegistry();
export type { EditorRecord };
