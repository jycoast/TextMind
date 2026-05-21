import { backend } from "@/api/backend";
import { pluginManager, type Plugin, type PluginManifest } from "@/plugins/core";

interface ExternalManifestRaw {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  entry?: string;
  entryUrl?: string;
  activationEvents?: string[];
  permissions?: string[];
  enabled?: boolean;
  installPath?: string;
  error?: string;
}

export interface LoadedExternalPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  installPath: string;
  permissions: string[];
  error?: string;
  /** True when the script loaded and the plugin successfully registered. */
  activated: boolean;
}

const loaded = new Map<string, LoadedExternalPlugin>();

/**
 * Discover every plugin under %AppData%/TextMind/plugins/, then dynamically
 * import each enabled entry script and register the exported plugin with
 * the host. Errors are caught per-plugin; one bad plugin never blocks the
 * others.
 *
 * Plugin entries must export a default Plugin object (matching the
 * @/plugins/core Plugin contract) or a function that returns one.
 */
export async function discoverAndLoadExternalPlugins(): Promise<
  LoadedExternalPlugin[]
> {
  let res;
  try {
    res = await backend.listExternalPlugins();
  } catch (err) {
    console.warn("[plugins] listExternalPlugins failed:", err);
    return [];
  }
  if (!res || !Array.isArray(res.plugins)) return [];

  const out: LoadedExternalPlugin[] = [];
  for (const raw of res.plugins as unknown as ExternalManifestRaw[]) {
    const slot: LoadedExternalPlugin = {
      manifest: toManifest(raw),
      enabled: raw.enabled !== false,
      installPath: raw.installPath || "",
      permissions: raw.permissions || [],
      activated: false,
      error: raw.error,
    };
    loaded.set(slot.manifest.id, slot);
    out.push(slot);

    if (raw.error) continue;
    if (!slot.enabled) continue;

    try {
      const plugin = await loadOnePlugin(raw);
      if (plugin) {
        pluginManager.register(plugin);
        await pluginManager.activate(plugin.manifest.id);
        slot.activated = true;
      }
    } catch (err) {
      slot.error = err instanceof Error ? err.message : String(err);
      console.error(
        `[plugins] failed to load external plugin ${raw.id}:`,
        err,
      );
    }
  }
  return out;
}

export function listLoadedExternalPlugins(): LoadedExternalPlugin[] {
  return Array.from(loaded.values());
}

function toManifest(raw: ExternalManifestRaw): PluginManifest {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    version: raw.version || "0.0.0",
    description: raw.description,
    builtin: false,
    activationEvents: (raw.activationEvents as PluginManifest["activationEvents"]) || ["onStartup"],
  };
}

async function loadOnePlugin(raw: ExternalManifestRaw): Promise<Plugin | null> {
  const entry = (raw.entry || "index.js").replace(/^\.\//, "");
  // Read source text from disk through the Wails bridge - the asset server
  // doesn't serve arbitrary files from %AppData%, so we have to inline.
  const source = await backend.readPluginFile(raw.id, entry);
  if (!source) {
    throw new Error(`empty or missing entry ${entry}`);
  }
  // Wrap as ESM blob so dynamic import sees a real module. The plugin's own
  // imports are limited to:
  //   import { ctx } from "textmind"  -- a virtual module we'll expose later
  // The current implementation requires plugins to either inline their deps
  // or use globalThis.TextMind (set below) to avoid the bare specifier issue.
  exposeGlobals();
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    const plugin = resolveExport(mod, raw.id);
    if (!plugin) throw new Error("plugin module has no default / plugin export");
    if (plugin.manifest?.id !== raw.id) {
      throw new Error(
        `manifest id mismatch (folder: ${raw.id}, export: ${plugin.manifest?.id})`,
      );
    }
    return plugin;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resolveExport(mod: unknown, id: string): Plugin | null {
  const m = mod as Record<string, unknown>;
  const candidates: unknown[] = [m.default, m.plugin, m[id]];
  for (const c of candidates) {
    if (isPlugin(c)) return c;
    if (typeof c === "function") {
      try {
        const out = (c as () => unknown)();
        if (isPlugin(out)) return out;
      } catch (err) {
        console.warn(`[plugins] factory ${id} threw:`, err);
      }
    }
  }
  return null;
}

function isPlugin(value: unknown): value is Plugin {
  if (!value || typeof value !== "object") return false;
  const v = value as { manifest?: unknown; activate?: unknown };
  return (
    typeof v.activate === "function" &&
    Boolean(v.manifest) &&
    typeof (v.manifest as { id?: unknown }).id === "string"
  );
}

let globalsExposed = false;

/**
 * Make a curated subset of the host API available to external plugins via
 * globalThis.TextMind. Built-ins import from `@/plugins/core` directly; we
 * cannot give external scripts module specifiers in a Wails-embedded build
 * without a virtual module registry, so a global namespace is the pragmatic
 * substitute.
 */
function exposeGlobals(): void {
  if (globalsExposed) return;
  globalsExposed = true;
  const g = globalThis as unknown as { TextMind?: unknown };
  g.TextMind = {
    pluginManager,
  };
}
