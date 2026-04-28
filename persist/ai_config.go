package persist

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// AIConfig is persisted AI provider configuration.
//
// All fields are user-editable. The on-disk file uses JSON with snake_case to
// match the rest of the persist package; the wails-exported camelCase shape
// is in app.go.
type AIConfig struct {
	BaseURL      string   `json:"base_url"`
	APIKey       string   `json:"api_key"`
	DefaultModel string   `json:"default_model"`
	Models       []string `json:"models,omitempty"`
	SystemPrompt string   `json:"system_prompt,omitempty"`
}

// AIConfigPath returns the on-disk path for the AI configuration file.
//
// It lives in the same directory as the session.json (UserConfigDir/tinyEditor)
// so that all app state stays under one tree.
func AIConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tinyEditor", "ai-config.json"), nil
}

// LoadAIConfig reads the config from path. A missing or unreadable file
// produces a zero-value config and a nil error so first-run users see a clean
// blank form.
func LoadAIConfig(path string) (AIConfig, error) {
	if path == "" {
		return AIConfig{}, errors.New("persist: empty AI config path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AIConfig{}, nil
		}
		return AIConfig{}, err
	}
	var cfg AIConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return AIConfig{}, nil
	}
	return cfg, nil
}

// SaveAIConfig writes the config atomically with mode 0o600 so the API key is
// readable only by the current user.
func SaveAIConfig(path string, cfg AIConfig) error {
	if path == "" {
		return errors.New("persist: empty AI config path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
