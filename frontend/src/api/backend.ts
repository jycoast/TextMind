import * as App from "@wails/go/main/App";
import type { extract, main, persist } from "@wails/go/models";

export const backend = {
  loadSession: (): Promise<main.SessionPayload> => App.LoadSession(),
  saveSession: (payload: {
    nextTabSeq: number;
    selectedIndex: number;
    tabs: persist.TabSnapshot[];
    recentFiles: persist.RecentFile[];
    workspaceRoot: string;
  }): Promise<boolean> =>
    App.SaveSession(payload as unknown as main.SessionPayload),

  dedupeSelected: (text: string): Promise<main.ToolResult> =>
    App.DedupeSelected(text),
  keepSingletonSelected: (text: string): Promise<main.ToolResult> =>
    App.KeepSingletonSelected(text),
  toInListSelected: (text: string): Promise<main.ToolResult> =>
    App.ToInListSelected(text),

  extractFromText: (
    text: string,
    opts: extract.Options,
  ): Promise<main.ExtractResult> => App.ExtractFromText(text, opts),

  openTextFile: (): Promise<main.OpenFileResult> => App.OpenTextFile(),
  openTextFileByPath: (path: string): Promise<main.OpenFileResult> =>
    App.OpenTextFileByPath(path),
  saveTextFile: (path: string, text: string): Promise<main.SaveFileResult> =>
    App.SaveTextFile(path, text),
  saveTextFileAs: (
    defaultName: string,
    text: string,
  ): Promise<main.SaveFileResult> => App.SaveTextFileAs(defaultName, text),

  openFolder: (): Promise<main.OpenFolderResult> => App.OpenFolder(),
  listFolder: (path: string): Promise<main.ListFolderResult> =>
    App.ListFolder(path),

  consumeLaunchPath: (): Promise<string> => App.ConsumeLaunchPath(),

  notify: (title: string, message: string): Promise<void> =>
    App.Notify(title, message),
  log: (message: string): Promise<void> => App.Log(message),
  openLogDir: (): Promise<void> => App.OpenLogDir(),
};

export function isBackendReady(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window as unknown as { go?: { main?: { App?: unknown } } }).go?.main
        ?.App,
  );
}
