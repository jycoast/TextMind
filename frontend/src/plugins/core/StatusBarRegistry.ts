import { computed, reactive, type ComputedRef } from "vue";
import type { Disposable, StatusBarItemSpec } from "./types";

interface StatusBarRecord extends StatusBarItemSpec {
  pluginId: string;
}

class StatusBarRegistry {
  private readonly items = reactive(new Map<string, StatusBarRecord>());

  register(pluginId: string, spec: StatusBarItemSpec): Disposable {
    if (this.items.has(spec.id)) {
      throw new Error(`Status bar item already registered: ${spec.id}`);
    }
    this.items.set(spec.id, { ...spec, pluginId });
    return {
      dispose: () => {
        const rec = this.items.get(spec.id);
        if (rec && rec.pluginId === pluginId) this.items.delete(spec.id);
      },
    };
  }

  itemsAt(align: "left" | "right"): ComputedRef<StatusBarRecord[]> {
    return computed(() =>
      Array.from(this.items.values())
        .filter((i) => i.align === align)
        .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    );
  }
}

export const statusBarRegistry = new StatusBarRegistry();
export type { StatusBarRecord };
