import { computed, reactive, type ComputedRef } from "vue";
import type { Disposable, SidePanelSpec } from "./types";

interface SidePanelRecord extends SidePanelSpec {
  pluginId: string;
  visible: boolean;
}

// reactive() unwraps Refs at the top level of objects it stores, so we keep
// visibility as a plain boolean and rely on reactive() for reactivity.
class SidePanelRegistry {
  private readonly panels = reactive(new Map<string, SidePanelRecord>());

  register(pluginId: string, spec: SidePanelSpec): Disposable {
    if (this.panels.has(spec.id)) {
      throw new Error(`Side panel already registered: ${spec.id}`);
    }
    this.panels.set(spec.id, { ...spec, pluginId, visible: false });
    return {
      dispose: () => {
        const rec = this.panels.get(spec.id);
        if (rec && rec.pluginId === pluginId) this.panels.delete(spec.id);
      },
    };
  }

  setVisible(id: string, visible: boolean): void {
    const rec = this.panels.get(id);
    if (rec) rec.visible = visible;
  }

  toggle(id: string): void {
    const rec = this.panels.get(id);
    if (rec) rec.visible = !rec.visible;
  }

  isVisible(id: string): boolean {
    return Boolean(this.panels.get(id)?.visible);
  }

  list(): SidePanelRecord[] {
    return Array.from(this.panels.values());
  }

  visiblePanels(position: "left" | "right"): ComputedRef<SidePanelRecord[]> {
    return computed(() =>
      Array.from(this.panels.values()).filter(
        (p) => p.position === position && p.visible,
      ),
    );
  }
}

export const sidePanelRegistry = new SidePanelRegistry();
export type { SidePanelRecord };
