// Plugin system core types.
//
// The architecture is intentionally minimal: a Plugin declares a manifest and
// an activate(ctx) function. ctx exposes a handful of registries (commands,
// menus, keybindings, editors, side panels, status bar, settings, modals,
// storage, events, backend). Every register* call returns a Disposable so
// the host can deactivate plugins cleanly.

import type { Component } from "vue";
import type { EditorAdapter, Tab } from "@/types";
import type { backend as BackendApi } from "@/api/backend";

export interface Disposable {
  dispose(): void;
}

export type ActivationEvent =
  | "onStartup"
  | `onCommand:${string}`
  | `onLanguage:${string}`
  | `onFileExtension:${string}`;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  builtin: boolean;
  activationEvents?: ActivationEvent[];
  dependencies?: string[];
}

export interface CommandSpec {
  id: string;
  title: string;
  category?: string;
  defaultKeybinding?: string;
  bindable?: boolean;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}

export interface SubmenuItem {
  /** Stable id; used as v-for key. */
  id: string;
  /** Visible label. */
  label: string;
  /** Optional native tooltip (e.g. full path for recent files). */
  title?: string;
  /** Command id executed on click. If omitted the item is inert. */
  commandId?: string;
  /** Args forwarded to the command handler. */
  commandArgs?: unknown[];
  /** Disabled state; defaults to false. */
  disabled?: boolean;
}

export interface MenuItemSpec {
  id: string;
  menu: string;
  group?: string;
  order?: number;
  label: string | (() => string);
  commandId?: string;
  enabled?: () => boolean;
  visible?: () => boolean;
  separatorBefore?: boolean;
  submenu?: string;
  /**
   * When set, the item is rendered as a hover-flyout parent. The provider
   * is invoked each time the parent menu opens, so it can return a fresh,
   * dynamic list (recent files, open editors, etc.). Returning an empty
   * array shows an "暂无记录" empty-state. When this is set, `commandId`
   * on the parent item is ignored (the row is hover-only).
   */
  submenuProvider?: () => SubmenuItem[];
}

export interface TopMenuSpec {
  id: string;
  label: string;
  order?: number;
}

export type SidePanelPosition = "left" | "right";

export interface SidePanelSpec {
  id: string;
  title: string;
  position: SidePanelPosition;
  defaultWidth?: number;
  component: Component;
  visibilityRef?: { value: boolean };
}

export interface StatusBarItemSpec {
  id: string;
  align: "left" | "right";
  order?: number;
  component: Component;
}

export interface SettingsPageSpec {
  id: string;
  title: string;
  order?: number;
  component: Component;
}

export interface ModalSpec {
  id: string;
  component: Component;
  props?: Record<string, unknown>;
  onClose?: () => void;
}

export type EditorFactory = (host: HTMLElement, ctx: EditorCreateContext) => EditorAdapter;

export interface EditorCreateContext {
  initialTheme: string;
  tab: Tab | null;
}

export interface EditorRegistration {
  id: string;
  match: (tab: Tab) => boolean;
  priority: number;
  factory: EditorFactory;
  displayName?: string;
}

export interface PluginContext {
  manifest: PluginManifest;
  commands: {
    register(spec: CommandSpec): Disposable;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
    has(id: string): boolean;
  };
  keybindings: {
    bindDefault(commandId: string, combo: string): Disposable;
  };
  menus: {
    registerTopMenu(spec: TopMenuSpec): Disposable;
    registerItem(spec: MenuItemSpec): Disposable;
  };
  editor: {
    registerEditor(reg: EditorRegistration): Disposable;
    getActiveAdapter(): EditorAdapter | null;
    getActiveTab(): Tab | null;
    onEditorAttached(handler: (adapter: EditorAdapter) => void): Disposable;
  };
  sidePanels: {
    register(spec: SidePanelSpec): Disposable;
    setVisible(id: string, visible: boolean): void;
    toggle(id: string): void;
    isVisible(id: string): boolean;
  };
  statusBar: {
    register(spec: StatusBarItemSpec): Disposable;
  };
  settings: {
    registerPage(spec: SettingsPageSpec): Disposable;
  };
  ui: {
    openModal(spec: ModalSpec): Disposable;
    closeModal(id: string): void;
    showTip(message: string): void;
    showCenterNotice(message: string): void;
  };
  storage: {
    /** Returns a stable plugin-scoped storage namespace string. */
    namespace(): string;
  };
  events: {
    on(event: string, handler: (...args: unknown[]) => void): Disposable;
    emit(event: string, ...args: unknown[]): void;
  };
  backend: typeof BackendApi;
}

export interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
