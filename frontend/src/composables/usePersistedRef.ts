import { ref, watch, type Ref } from "vue";

export interface PersistOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

export function usePersistedRef<T>(
  key: string,
  initialValue: T,
  options: PersistOptions<T> = {},
): Ref<T> {
  const serialize = options.serialize ?? ((v: T) => JSON.stringify(v));
  const deserialize =
    options.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const stored = readFromStorage<T>(key, deserialize);
  const r = ref(stored !== undefined ? stored : initialValue) as Ref<T>;

  watch(
    r,
    (val) => {
      try {
        window.localStorage.setItem(key, serialize(val));
      } catch {
        /* ignore quota / SSR */
      }
    },
    { deep: true },
  );

  return r;
}

function readFromStorage<T>(
  key: string,
  deserialize: (raw: string) => T,
): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return undefined;
    return deserialize(raw);
  } catch {
    return undefined;
  }
}
