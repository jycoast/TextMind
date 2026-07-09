package main

import (
	"os"
	"strings"
	"sync"
	"time"
)

// fileWatchEntry tracks a single file's last known modification time.
type fileWatchEntry struct {
	path    string
	modTime time.Time
}

// fileWatcher tracks open files and checks for external modifications on
// demand (pull model). The frontend calls CheckFileChanges when the window
// regains focus or on tab switch, avoiding background goroutines that can
// conflict with Wails' Windows message loop.
type fileWatcher struct {
	mu    sync.Mutex
	files map[string]*fileWatchEntry
}

func newFileWatcher() *fileWatcher {
	return &fileWatcher{
		files: make(map[string]*fileWatchEntry),
	}
}

// FileChangeInfo is one entry returned by CheckFileChanges.
type FileChangeInfo struct {
	Path    string `json:"path"`
	ModTime int64  `json:"modTime"`
}

// CheckFileChanges examines all watched files and returns those whose
// modification time has advanced since the last check. The frontend calls
// this on window focus to detect external edits without a background poller.
func (a *App) CheckFileChanges() []FileChangeInfo {
	a.fileWatcher.mu.Lock()
	entries := make([]*fileWatchEntry, 0, len(a.fileWatcher.files))
	for _, e := range a.fileWatcher.files {
		entries = append(entries, e)
	}
	a.fileWatcher.mu.Unlock()

	var changed []FileChangeInfo
	for _, entry := range entries {
		info, err := os.Stat(entry.path)
		if err != nil {
			continue
		}
		newMod := info.ModTime()
		if newMod.After(entry.modTime) {
			a.fileWatcher.mu.Lock()
			if cur, ok := a.fileWatcher.files[entry.path]; ok {
				cur.modTime = newMod
			}
			a.fileWatcher.mu.Unlock()
			changed = append(changed, FileChangeInfo{
				Path:    entry.path,
				ModTime: newMod.Unix(),
			})
		}
	}
	if changed == nil {
		changed = []FileChangeInfo{}
	}
	return changed
}

// WatchFile starts tracking a file for external modifications. Called by
// the frontend when a file-backed tab is opened or saved.
func (a *App) WatchFile(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		return
	}
	a.fileWatcher.mu.Lock()
	a.fileWatcher.files[path] = &fileWatchEntry{
		path:    path,
		modTime: info.ModTime(),
	}
	a.fileWatcher.mu.Unlock()
}

// UnwatchFile stops tracking a file. Called when a tab is closed.
func (a *App) UnwatchFile(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	a.fileWatcher.mu.Lock()
	delete(a.fileWatcher.files, path)
	a.fileWatcher.mu.Unlock()
}

// RefreshFileWatch updates the baseline modTime for a path (e.g. after the
// user saves). Prevents false "external change" notifications after a save.
func (a *App) RefreshFileWatch(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		return
	}
	a.fileWatcher.mu.Lock()
	if entry, ok := a.fileWatcher.files[path]; ok {
		entry.modTime = info.ModTime()
	}
	a.fileWatcher.mu.Unlock()
}
