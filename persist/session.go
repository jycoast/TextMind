package persist

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Session is persisted app state (tabs and selection).
type Session struct {
	NextTabSeq    int           `json:"next_tab_seq"`
	SelectedIndex int           `json:"selected_index"`
	Tabs          []TabSnapshot `json:"tabs"`
	RecentFiles   []RecentFile  `json:"recent_files,omitempty"`
	WorkspaceRoot string        `json:"workspace_root,omitempty"`
}

// TabSnapshot is one document tab.
type TabSnapshot struct {
	Title    string `json:"title"`
	Text     string `json:"text"`
	Language string `json:"language,omitempty"`
	Path     string `json:"path,omitempty"`
	Dirty    bool   `json:"dirty,omitempty"`
}

// RecentFile is recently opened file metadata.
type RecentFile struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Language string `json:"language,omitempty"`
}

// DefaultPath returns the path to the session file under the user config directory.
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tinyEditor", "session.json"), nil
}

// Load reads session from path. If the file is missing or invalid, returns (nil, nil).
func Load(path string) (*Session, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, nil
	}
	if len(s.Tabs) == 0 {
		return nil, nil
	}
	return &s, nil
}

// Save writes session to path (creates parent directories).
func Save(path string, s *Session) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
