import { usePersistedRef } from "./usePersistedRef";

export type FocusMode = "off" | "typewriter" | "focus" | "both";

const ORDER: FocusMode[] = ["off", "typewriter", "focus", "both"];

const LABELS: Record<FocusMode, string> = {
  off: "标准",
  typewriter: "打字机",
  focus: "专注",
  both: "打字机+专注",
};

/**
 * Persistent editor focus/typewriter setting. `typewriter` keeps the cursor
 * block near vertical center while typing; `focus` dims everything but the
 * active block.
 */
export function useFocusMode() {
  const mode = usePersistedRef<FocusMode>("textmind.markdown.focusMode", "off");
  const cycle = (): FocusMode => {
    const index = ORDER.indexOf(mode.value);
    const next = ORDER[(index + 1) % ORDER.length];
    mode.value = next;
    return next;
  };
  return { mode, cycle, label: () => LABELS[mode.value] };
}
