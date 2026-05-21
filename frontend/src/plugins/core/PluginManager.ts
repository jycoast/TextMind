import { backend } from "@/api/backend";
import type {
  ActivationEvent,
  Disposable,
  Plugin,
  PluginContext,
  PluginManifest,
} from "./types";
import { commandRegistry } from "./CommandRegistry";
import { keybindingRegistry } from "./KeybindingRegistry";
import { menuRegistry } from "./MenuRegistry";
import { editorRegistry } from "./EditorRegistry";
import { sidePanelRegistry } from "./SidePanelRegistry";
import { statusBarRegistry } from "./StatusBarRegistry";
import { settingsRegistry } from "./SettingsRegistry";
import { modalLayer } from "./ModalLayer";
import { eventBus } from "./events";

interface ActivatedPlugin {
  plugin: Plugin;
  disposables: Disposable[];
  manifest: PluginManifest;
}

class PluginManager {
  private readonly registered = new Map<string, Plugin>();
  private readonly activated = new Map<string, ActivatedPlugin>();
  private uiAdapter: PluginUIAdapter | null = null;

  setUIAdapter(adapter: PluginUIAdapter): void {
    this.uiAdapter = adapter;
  }

  register(plugin: Plugin): void {
    if (this.registered.has(plugin.manifest.id)) {
      console.warn(`[plugins] already registered: ${plugin.manifest.id}`);
      return;
    }
    this.registered.set(plugin.manifest.id, plugin);
  }

  list(): PluginManifest[] {
    return Array.from(this.registered.values()).map((p) => p.manifest);
  }

  isActivated(id: string): boolean {
    return this.activated.has(id);
  }

  /** Activate every registered plugin whose activationEvents matches. */
  async fire(event: ActivationEvent): Promise<void> {
    for (const plugin of this.registered.values()) {
      if (this.activated.has(plugin.manifest.id)) continue;
      const events = plugin.manifest.activationEvents || ["onStartup"];
      if (!events.includes(event)) continue;
      await this.activate(plugin.manifest.id);
    }
  }

  /** Activate a specific plugin (recursively activates deps first). */
  async activate(id: string): Promise<void> {
    if (this.activated.has(id)) return;
    const plugin = this.registered.get(id);
    if (!plugin) {
      console.warn(`[plugins] unknown plugin: ${id}`);
      return;
    }
    for (const dep of plugin.manifest.dependencies || []) {
      await this.activate(dep);
    }
    const tracked: Disposable[] = [];
    const ctx = this.buildContext(plugin.manifest, tracked);
    try {
      await plugin.activate(ctx);
      this.activated.set(id, { plugin, disposables: tracked, manifest: plugin.manifest });
    } catch (err) {
      console.error(`[plugins] activate ${id} failed:`, err);
      for (const d of tracked) {
        try {
          d.dispose();
        } catch {
          /* swallow */
        }
      }
    }
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.activated.get(id);
    if (!entry) return;
    try {
      await entry.plugin.deactivate?.();
    } catch (err) {
      console.error(`[plugins] deactivate ${id}:`, err);
    }
    for (const d of entry.disposables.reverse()) {
      try {
        d.dispose();
      } catch (err) {
        console.error(`[plugins] dispose for ${id}:`, err);
      }
    }
    this.activated.delete(id);
  }

  private buildContext(
    manifest: PluginManifest,
    tracked: Disposable[],
  ): PluginContext {
    const track = <T extends Disposable>(d: T): T => {
      tracked.push(d);
      return d;
    };
    const pluginId = manifest.id;
    const ui = this.uiAdapter;
    return {
      manifest,
      commands: {
        register: (spec) => track(commandRegistry.register(pluginId, spec)),
        execute: (id, ...args) => commandRegistry.execute(id, ...args),
        has: (id) => commandRegistry.has(id),
      },
      keybindings: {
        bindDefault: (commandId, combo) =>
          track(keybindingRegistry.bindDefault(commandId, combo)),
      },
      menus: {
        registerTopMenu: (spec) =>
          track(menuRegistry.registerTopMenu(pluginId, spec)),
        registerItem: (spec) => track(menuRegistry.registerItem(pluginId, spec)),
      },
      editor: {
        registerEditor: (reg) => track(editorRegistry.register(pluginId, reg)),
        getActiveAdapter: () => ui?.getActiveAdapter() ?? null,
        getActiveTab: () => ui?.getActiveTab() ?? null,
        onEditorAttached: (h) => track(editorRegistry.onEditorAttached(h)),
      },
      sidePanels: {
        register: (spec) => track(sidePanelRegistry.register(pluginId, spec)),
        setVisible: (id, v) => sidePanelRegistry.setVisible(id, v),
        toggle: (id) => sidePanelRegistry.toggle(id),
        isVisible: (id) => sidePanelRegistry.isVisible(id),
      },
      statusBar: {
        register: (spec) => track(statusBarRegistry.register(pluginId, spec)),
      },
      settings: {
        registerPage: (spec) =>
          track(settingsRegistry.registerPage(pluginId, spec)),
      },
      ui: {
        openModal: (spec) => track(modalLayer.open(spec)),
        closeModal: (id) => modalLayer.close(id),
        showTip: (msg) => ui?.showTip(msg),
        showCenterNotice: (msg) => ui?.showCenterNotice(msg),
      },
      storage: {
        namespace: () => pluginId,
      },
      events: {
        on: (event, handler) => track(eventBus.on(event, handler)),
        emit: (event, ...args) => eventBus.emit(event, ...args),
      },
      backend,
    };
  }
}

export interface PluginUIAdapter {
  getActiveAdapter(): import("@/types").EditorAdapter | null;
  getActiveTab(): import("@/types").Tab | null;
  showTip(message: string): void;
  showCenterNotice(message: string): void;
}

export const pluginManager = new PluginManager();
