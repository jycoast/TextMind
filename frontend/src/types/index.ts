export type Theme = "dark" | "light";

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

export interface Tab {
  id: string;
  title: string;
  text: string;
  language: string;
  path: string;
  viewState: MonacoViewState | null;
  dirty: boolean;
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

export interface EditorAdapter {
  mode: EditorAdapterMode;
  supportsColumnMode: boolean;
  getValue: () => string;
  setValue: (value: string) => void;
  getViewState: () => MonacoViewState | null;
  setViewState: (viewState: MonacoViewState | null) => void;
  setLanguage: (language: string) => void;
  setTheme: (themeName: string) => void;
  getSelectionText: () => string;
  replaceSelection: (text: string) => boolean;
  setColumnMode: (enabled: boolean) => boolean;
  focus: () => void;
  onChange: (handler: () => void) => void;
  onContextMenu: (handler: (ev: MouseEvent) => void) => void;
  forceRefresh: () => void;
  dispose: () => void;
}
