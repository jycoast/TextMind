import { onBeforeUnmount, onMounted } from "vue";

export interface ShortcutHandlers {
  onSave: () => void;
  onOpenTemplate: () => void;
  onToggleColumnMode: () => void;
  onToggleAIPanel?: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const listener = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      handlers.onEscape();
      return;
    }
    const key = ev.key.toLowerCase();
    if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && !ev.metaKey && key === "s") {
      ev.preventDefault();
      handlers.onSave();
      return;
    }
    if (ev.ctrlKey && !ev.altKey && ev.shiftKey && !ev.metaKey && key === "g") {
      ev.preventDefault();
      handlers.onOpenTemplate();
      return;
    }
    if (ev.ctrlKey && ev.altKey && !ev.shiftKey && !ev.metaKey && key === "l") {
      ev.preventDefault();
      handlers.onToggleColumnMode();
      return;
    }
    if (
      ev.ctrlKey &&
      !ev.altKey &&
      !ev.shiftKey &&
      !ev.metaKey &&
      key === "l" &&
      handlers.onToggleAIPanel
    ) {
      ev.preventDefault();
      handlers.onToggleAIPanel();
    }
  };

  onMounted(() => {
    document.addEventListener("keydown", listener);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("keydown", listener);
  });
}
