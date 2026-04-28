package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"tinyEditor/dedupe"
	"tinyEditor/extract"
	"tinyEditor/inlist"
	"tinyEditor/persist"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx          context.Context
	logger       *log.Logger
	sessionPath  string
	launchPath   string
	aiConfigPath string
	aiConvPath   string
	aiMu         sync.Mutex
	aiStreams    streamRegistry
	version      string
}

type SessionPayload struct {
	NextTabSeq    int                   `json:"nextTabSeq"`
	SelectedIndex int                   `json:"selectedIndex"`
	Tabs          []persist.TabSnapshot `json:"tabs"`
	RecentFiles   []persist.RecentFile  `json:"recentFiles"`
	WorkspaceRoot string                `json:"workspaceRoot"`
}

type ToolResult struct {
	Text    string `json:"text"`
	Removed int    `json:"removed"`
	Count   int    `json:"count"`
}

type ExtractResult struct {
	Text       string `json:"text"`
	MatchCount int    `json:"matchCount"`
	LineCount  int    `json:"lineCount"`
	Error      string `json:"error"`
}

type OpenFileResult struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Text  string `json:"text"`
	Error string `json:"error"`
}

type SaveFileResult struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Error string `json:"error"`
}

type OpenFolderResult struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

type FolderEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type ListFolderResult struct {
	Path    string        `json:"path"`
	Entries []FolderEntry `json:"entries"`
	Error   string        `json:"error"`
}

func NewApp(logger *log.Logger, launchPath string) *App {
	return &App{
		logger:       logger,
		sessionPath:  sessionFilePath(logger),
		aiConfigPath: aiConfigFilePath(logger),
		aiConvPath:   aiConversationsFilePath(logger),
		launchPath:   strings.TrimSpace(launchPath),
	}
}

// SetVersion records the running build's version string. main injects the
// value baked in at compile time; tests can override it directly.
func (a *App) SetVersion(v string) {
	v = strings.TrimSpace(v)
	if v == "" {
		v = "dev"
	}
	a.version = v
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(context.Context) {
	// Session is saved by explicit frontend call.
	a.aiStreams.cancelAll()
}

func sessionFilePath(logger *log.Logger) string {
	p, err := persist.DefaultPath()
	if err != nil {
		logger.Printf("user config dir unavailable, using local session.json: %v", err)
		return "tinyEditor-session.json"
	}
	return p
}

func aiConfigFilePath(logger *log.Logger) string {
	p, err := persist.AIConfigPath()
	if err != nil {
		logger.Printf("user config dir unavailable, using local ai-config.json: %v", err)
		return "tinyEditor-ai-config.json"
	}
	return p
}

func aiConversationsFilePath(logger *log.Logger) string {
	p, err := persist.AIConversationsPath()
	if err != nil {
		logger.Printf("user config dir unavailable, using local ai-conversations.json: %v", err)
		return "tinyEditor-ai-conversations.json"
	}
	return p
}

func (a *App) LoadSession() SessionPayload {
	s, err := persist.Load(a.sessionPath)
	if err != nil {
		a.logger.Printf("session load error: %v", err)
		return SessionPayload{}
	}
	if s == nil {
		return SessionPayload{}
	}
	return SessionPayload{
		NextTabSeq:    s.NextTabSeq,
		SelectedIndex: s.SelectedIndex,
		Tabs:          s.Tabs,
		RecentFiles:   s.RecentFiles,
		WorkspaceRoot: s.WorkspaceRoot,
	}
}

func (a *App) SaveSession(payload SessionPayload) bool {
	if len(payload.Tabs) == 0 {
		return true
	}
	s := &persist.Session{
		NextTabSeq:    payload.NextTabSeq,
		SelectedIndex: payload.SelectedIndex,
		Tabs:          payload.Tabs,
		RecentFiles:   payload.RecentFiles,
		WorkspaceRoot: strings.TrimSpace(payload.WorkspaceRoot),
	}
	if err := persist.Save(a.sessionPath, s); err != nil {
		a.logger.Printf("session save failed: %v", err)
		return false
	}
	return true
}

func (a *App) DedupeSelected(selected string) ToolResult {
	selected = strings.TrimSpace(selected)
	if selected == "" {
		return ToolResult{}
	}
	result, removed := dedupe.LinesAndRemoved(selected)
	return ToolResult{Text: result, Removed: removed}
}

func (a *App) KeepSingletonSelected(selected string) ToolResult {
	selected = strings.TrimSpace(selected)
	if selected == "" {
		return ToolResult{}
	}
	result, removed := dedupe.OnlySingletonLines(selected)
	return ToolResult{Text: result, Removed: removed}
}

func (a *App) ToInListSelected(selected string) ToolResult {
	selected = strings.TrimSpace(selected)
	if selected == "" {
		return ToolResult{}
	}
	result, count := inlist.QuotedCommaLines(selected)
	return ToolResult{Text: result, Count: count}
}

func (a *App) ExtractFromText(text string, opts extract.Options) ExtractResult {
	if strings.TrimSpace(text) == "" {
		return ExtractResult{Error: "没有可提取的文本"}
	}
	res := extract.Run(text, opts)
	return ExtractResult{
		Text:       res.Text,
		MatchCount: res.MatchCount,
		LineCount:  res.LineCount,
		Error:      res.Error,
	}
}

func (a *App) Notify(title, message string) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "notify", map[string]string{
		"title":   title,
		"message": message,
	})
}

func (a *App) Log(message string) {
	if a.logger != nil {
		a.logger.Println(message)
	}
}

func (a *App) OpenLogDir() {
	if a.ctx == nil {
		return
	}
	runtime.BrowserOpenURL(a.ctx, "file:///"+strings.ReplaceAll(currentDir(), "\\", "/"))
}

func (a *App) OpenTextFile() OpenFileResult {
	if a.ctx == nil {
		return OpenFileResult{Error: "应用上下文未初始化"}
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return OpenFileResult{Error: "文件选择失败: " + err.Error()}
	}
	if strings.TrimSpace(path) == "" {
		return OpenFileResult{}
	}
	return readTextFile(path)
}

func (a *App) OpenTextFileByPath(path string) OpenFileResult {
	path = strings.TrimSpace(path)
	if path == "" {
		return OpenFileResult{Error: "文件路径为空"}
	}
	return readTextFile(path)
}

func (a *App) OpenFolder() OpenFolderResult {
	if a.ctx == nil {
		return OpenFolderResult{Error: "应用上下文未初始化"}
	}
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "打开文件夹",
	})
	if err != nil {
		return OpenFolderResult{Error: "文件夹选择失败: " + err.Error()}
	}
	if strings.TrimSpace(path) == "" {
		return OpenFolderResult{}
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return OpenFolderResult{Error: "文件夹路径无效: " + err.Error()}
	}
	return OpenFolderResult{Path: absPath}
}

func (a *App) ListFolder(path string) ListFolderResult {
	path = strings.TrimSpace(path)
	if path == "" {
		return ListFolderResult{Error: "文件夹路径为空"}
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return ListFolderResult{Error: "文件夹路径无效: " + err.Error()}
	}
	items, err := os.ReadDir(absPath)
	if err != nil {
		return ListFolderResult{Error: "读取文件夹失败: " + err.Error()}
	}

	entries := make([]FolderEntry, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name())
		if name == "" {
			continue
		}
		entries = append(entries, FolderEntry{
			Name:  name,
			Path:  filepath.Join(absPath, name),
			IsDir: item.IsDir(),
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	return ListFolderResult{
		Path:    absPath,
		Entries: entries,
	}
}

func (a *App) ConsumeLaunchPath() string {
	p := strings.TrimSpace(a.launchPath)
	a.launchPath = ""
	return p
}

func (a *App) SaveTextFile(path, text string) SaveFileResult {
	path = strings.TrimSpace(path)
	if path == "" {
		return SaveFileResult{Error: "保存路径为空"}
	}
	if err := saveText(path, text); err != nil {
		return SaveFileResult{Error: "保存失败: " + err.Error()}
	}
	return SaveFileResult{
		Name: filepath.Base(path),
		Path: path,
	}
}

func (a *App) SaveTextFileAs(defaultName, text string) SaveFileResult {
	if a.ctx == nil {
		return SaveFileResult{Error: "应用上下文未初始化"}
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存文件",
		DefaultFilename: strings.TrimSpace(defaultName),
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return SaveFileResult{Error: "文件保存失败: " + err.Error()}
	}
	if strings.TrimSpace(path) == "" {
		return SaveFileResult{}
	}
	if err := saveText(path, text); err != nil {
		return SaveFileResult{Error: "保存失败: " + err.Error()}
	}
	return SaveFileResult{
		Name: filepath.Base(path),
		Path: path,
	}
}

func saveText(path, text string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(text), 0o644)
}

func readTextFile(path string) OpenFileResult {
	data, err := os.ReadFile(path)
	if err != nil {
		return OpenFileResult{Error: "读取文件失败: " + err.Error()}
	}
	if !utf8.Valid(data) {
		return OpenFileResult{Error: "仅支持 UTF-8 文本文件"}
	}
	text := strings.TrimPrefix(string(data), "\uFEFF")
	return OpenFileResult{
		Name: filepath.Base(path),
		Path: path,
		Text: text,
	}
}

func currentDir() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}
