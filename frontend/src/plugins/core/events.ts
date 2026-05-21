import type { Disposable } from "./types";

type Handler = (...args: unknown[]) => void;

class EventBus {
  private readonly map = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): Disposable {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(handler);
    return {
      dispose: () => {
        const s = this.map.get(event);
        if (s) {
          s.delete(handler);
          if (s.size === 0) this.map.delete(event);
        }
      },
    };
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[events] handler for ${event} threw:`, err);
      }
    }
  }
}

export const eventBus = new EventBus();
