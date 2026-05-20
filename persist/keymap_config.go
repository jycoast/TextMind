package persist

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// KeymapConfig stores user-overridden keyboard shortcut bindings.
//
// Bindings maps an ActionId (e.g. "file.save") to a canonical key combo string
// (e.g. "Ctrl+S"). An empty value means the action is explicitly unbound.
// Action IDs that are not present in the map fall back to the frontend's
// built-in defaults, so the file only needs to contain overrides.
type KeymapConfig struct {
	Bindings map[string]string `json:"bindings"`
}

// KeymapConfigPath returns the on-disk path for the keymap config file.
//
// It lives in the same directory as session.json and ai-config.json so all
// user state stays under one tree.
func KeymapConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tinyEditor", "keymap.json"), nil
}

// LoadKeymapConfig reads the config from path. Missing or unreadable files
// produce a zero-value config with a nil error so first-run users start from
// the built-in defaults.
func LoadKeymapConfig(path string) (KeymapConfig, error) {
	if path == "" {
		return KeymapConfig{}, errors.New("persist: empty keymap config path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return KeymapConfig{}, nil
		}
		return KeymapConfig{}, err
	}
	var cfg KeymapConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return KeymapConfig{}, nil
	}
	if cfg.Bindings == nil {
		cfg.Bindings = map[string]string{}
	}
	return cfg, nil
}

// SaveKeymapConfig writes the config atomically. The file contains no secrets
// but we still keep it under the same tinyEditor config tree.
func SaveKeymapConfig(path string, cfg KeymapConfig) error {
	if path == "" {
		return errors.New("persist: empty keymap config path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if cfg.Bindings == nil {
		cfg.Bindings = map[string]string{}
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
