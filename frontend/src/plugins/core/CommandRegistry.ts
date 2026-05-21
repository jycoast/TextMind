import { reactive } from "vue";
import type { CommandSpec, Disposable } from "./types";

export interface CommandRecord {
  id: string;
  title: string;
  category?: string;
  defaultKeybinding?: string;
  bindable: boolean;
  pluginId: string;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}

class CommandRegistry {
  private readonly map = reactive(new Map<string, CommandRecord>());

  register(pluginId: string, spec: CommandSpec): Disposable {
    if (this.map.has(spec.id)) {
      throw new Error(`Command already registered: ${spec.id}`);
    }
    this.map.set(spec.id, {
      id: spec.id,
      title: spec.title,
      category: spec.category,
      defaultKeybinding: spec.defaultKeybinding,
      bindable: spec.bindable !== false,
      pluginId,
      handler: spec.handler,
    });
    return {
      dispose: () => {
        const rec = this.map.get(spec.id);
        if (rec && rec.pluginId === pluginId) this.map.delete(spec.id);
      },
    };
  }

  async execute(id: string, ...args: unknown[]): Promise<unknown> {
    const rec = this.map.get(id);
    if (!rec) {
      console.warn(`[commands] missing command: ${id}`);
      return undefined;
    }
    return await rec.handler(...args);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  get(id: string): CommandRecord | undefined {
    return this.map.get(id);
  }

  list(): CommandRecord[] {
    return Array.from(this.map.values());
  }

  /** All bindable commands, sorted by category then title. */
  listBindable(): CommandRecord[] {
    return this.list()
      .filter((c) => c.bindable)
      .sort((a, b) => {
        const ca = a.category || "";
        const cb = b.category || "";
        if (ca !== cb) return ca.localeCompare(cb);
        return a.title.localeCompare(b.title);
      });
  }
}

export const commandRegistry = new CommandRegistry();
