import { reactive } from "vue";
import type { Disposable } from "./types";

class KeybindingRegistry {
  /** commandId -> default combo */
  private readonly defaults = reactive(new Map<string, string>());

  bindDefault(commandId: string, combo: string): Disposable {
    this.defaults.set(commandId, combo);
    return {
      dispose: () => this.defaults.delete(commandId),
    };
  }

  getDefault(commandId: string): string {
    return this.defaults.get(commandId) || "";
  }

  /** All registered defaults as a plain map. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.defaults);
  }
}

export const keybindingRegistry = new KeybindingRegistry();
