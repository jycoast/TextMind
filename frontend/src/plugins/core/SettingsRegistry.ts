import { computed, reactive, type ComputedRef } from "vue";
import type { Disposable, SettingsPageSpec } from "./types";

interface SettingsRecord extends SettingsPageSpec {
  pluginId: string;
}

class SettingsRegistry {
  private readonly pages = reactive(new Map<string, SettingsRecord>());

  registerPage(pluginId: string, spec: SettingsPageSpec): Disposable {
    if (this.pages.has(spec.id)) {
      throw new Error(`Settings page already registered: ${spec.id}`);
    }
    this.pages.set(spec.id, { ...spec, pluginId });
    return {
      dispose: () => {
        const rec = this.pages.get(spec.id);
        if (rec && rec.pluginId === pluginId) this.pages.delete(spec.id);
      },
    };
  }

  list(): ComputedRef<SettingsRecord[]> {
    return computed(() =>
      Array.from(this.pages.values()).sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      ),
    );
  }
}

export const settingsRegistry = new SettingsRegistry();
export type { SettingsRecord };
