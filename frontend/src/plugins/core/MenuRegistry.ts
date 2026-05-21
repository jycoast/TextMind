import { computed, reactive, type ComputedRef } from "vue";
import type { Disposable, MenuItemSpec, TopMenuSpec } from "./types";

interface TopMenuRecord extends TopMenuSpec {
  pluginId: string;
}

interface MenuItemRecord extends MenuItemSpec {
  pluginId: string;
}

class MenuRegistry {
  private readonly topMenus = reactive(new Map<string, TopMenuRecord>());
  private readonly items = reactive(new Map<string, MenuItemRecord>());

  registerTopMenu(pluginId: string, spec: TopMenuSpec): Disposable {
    this.topMenus.set(spec.id, { ...spec, pluginId });
    return {
      dispose: () => this.topMenus.delete(spec.id),
    };
  }

  registerItem(pluginId: string, spec: MenuItemSpec): Disposable {
    if (this.items.has(spec.id)) {
      throw new Error(`Menu item already registered: ${spec.id}`);
    }
    this.items.set(spec.id, { ...spec, pluginId });
    return {
      dispose: () => {
        const rec = this.items.get(spec.id);
        if (rec && rec.pluginId === pluginId) this.items.delete(spec.id);
      },
    };
  }

  topMenuList(): ComputedRef<TopMenuRecord[]> {
    return computed(() =>
      Array.from(this.topMenus.values()).sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      ),
    );
  }

  /** Items for a given menu id (e.g. "topbar.file", "editor.context"). */
  itemsFor(menuId: string): ComputedRef<MenuItemRecord[]> {
    return computed(() => {
      const out: MenuItemRecord[] = [];
      for (const item of this.items.values()) {
        if (item.menu === menuId) out.push(item);
      }
      out.sort((a, b) => {
        const ga = a.group || "z";
        const gb = b.group || "z";
        if (ga !== gb) return ga.localeCompare(gb);
        return (a.order ?? 100) - (b.order ?? 100);
      });
      return out;
    });
  }
}

export const menuRegistry = new MenuRegistry();
export type { MenuItemRecord, TopMenuRecord };
