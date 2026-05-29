// Theme identifiers persisted in localStorage["TextMind.theme"]. The active
// list is owned by the textmind.theme built-in plugin (PRESETS in
// plugins/builtin/theme/index.ts) and the palettes live in styles/base.css.
// Each id also has a dedicated Monaco palette declared in
// composables/useMonaco.ts (MONACO_THEME_BY_APP_THEME + defineMonacoThemes),
// and useThemeStore additionally classifies it as "light-mode" vs "dark-mode"
// so Wails can swap the native window decoration. When adding a new theme:
// extend this union, add a CSS block in base.css, add a PRESETS entry,
// register a tiny-* Monaco theme in useMonaco.ts, and (if it's a light theme)
// add its id to LIGHT_THEMES in stores/theme.ts.
export type Theme = "dark" | "light" | "sakura" | "parchment";

export interface MonacoViewState {
  scrollTop: number;
  scrollLeft: number;
  selectionStart?: number;
  selectionEnd?: number;
  startLineNumber?: number;
  startColumn?: number;
  endLineNumber?: number;
  endColumn?: number;
}

/**
 * Per-editor view state. Each editor plugin owns a key in this map and is
 * responsible for serializing / restoring its own state. Legacy sessions
 * stored a raw MonacoViewState; the persistence layer migrates those on
 * load to { monaco: <legacy> }.
 */
export type ViewStateBag = Record<string, unknown>;

export interface Tab {
  id: string;
  title: string;
  text: string;
  language: string;
  path: string;
  /**
   * Map of editor-id -> opaque view state. Empty when the tab has never
   * been opened in any editor.
   */
  viewState: ViewStateBag | null;
  dirty: boolean;
  encoding: string;
  hasBOM: boolean;
  /**
   * Optional override pinning a specific editor for this tab (e.g. user
   * toggled "source view" on a markdown file). When unset, EditorRegistry
   * picks the highest-priority match.
   */
  editorId?: string;
}

export interface EncodingMeta {
  id: string;
  label: string;
  group: string;
}

export interface RecentFile {
  path: string;
  name: string;
  language: string;
}

export interface FolderNode {
  name: string;
  path: string;
  isDir: boolean;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  children: FolderNode[];
  error: string;
}

export type TopMenuId = "file" | "edit" | "settings" | null;
export type SubMenuId = "recent" | "theme" | null;

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface TabContextState {
  position: ContextMenuPosition;
  tabIndex: number;
}

export type EditorAdapterMode = "monaco" | "textarea";

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionStats {
  hasSelection: boolean;
  lineCount: number;
  charCount: number;
  byteCount: number;
}

export interface EditorAdapter {
  /** Editor implementation id (e.g. "monaco", "milkdown"). */
  id: string;
  /** Legacy hint for the bottom bar; kept for backwards compatibility. */
  mode: EditorAdapterMode;
  supportsColumnMode: boolean;
  getValue: () => string;
  setValue: (value: string) => void;
  /**
   * Returns the adapter-specific view state (cursor, scroll, etc.). The
   * tabs store stores it under tab.viewState[adapter.id] so each editor
   * has its own slot.
   */
  getViewState: () => unknown;
  setViewState: (viewState: unknown) => void;
  setLanguage: (language: string) => void;
  setTheme: (themeName: string) => void;
  getSelectionText: () => string;
  replaceSelection: (text: string) => boolean;
  setColumnMode: (enabled: boolean) => boolean;
  focus: () => void;
  onChange: (handler: () => void) => void;
  onContextMenu: (handler: (ev: MouseEvent) => void) => void;
  onSelectionsChange: (handler: (count: number) => void) => void;
  getCursorPosition: () => CursorPosition;
  getSelectionStats: () => SelectionStats;
  onCursorChange: (handler: () => void) => void;
  forceRefresh: () => void;
  /**
   * Open an editor-local find/search UI. Each adapter implements this with
   * whatever native widget makes sense (Monaco's built-in find, a custom
   * Milkdown bar, etc.). Returns true if the widget was opened.
   */
  triggerFind?: () => boolean;
  /**
   * Subscribe to native clipboard paste events on the editor surface.
   * Handlers run before the editor inserts the clipboard content. Returning
   * `true` (or calling preventDefault on the event manually) means the
   * handler consumed the event — the adapter must skip its default insert.
   */
  onPaste?: (handler: (ev: ClipboardEvent) => boolean | void) => void;
  /**
   * Insert plain text (markdown allowed) at the current cursor / selection.
   * Returns true when something was inserted, false if the editor wasn't
   * ready yet.
   */
  insertText?: (text: string) => boolean;
  /**
   * Reveal a 1-based line in the document. Used by line-addressable editors
   * (Monaco) to jump from the outline panel. Returns true on success.
   */
  revealLine?: (line: number, col?: number) => boolean;
  /**
   * Reveal the Nth heading node (0-based) in the document. Used by editors
   * that have no line concept (Milkdown / ProseMirror) but do have a doc
   * tree. The outline panel passes the same `index` it parsed out of the
   * markdown source so both editors land on the same heading.
   */
  revealNthHeading?: (index: number) => boolean;
  dispose: () => void;
}
