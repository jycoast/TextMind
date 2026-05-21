package persist

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// COSConfig holds the persisted Tencent Cloud COS upload settings.
//
// The on-disk file lives next to ai-config.json in UserConfigDir/TextMind so
// that all app state stays under one tree. Mode 0600 keeps the SecretKey
// readable only by the current user.
//
// CustomDomain is optional; when set, returned image URLs use it instead of
// the bucket default domain. KeyPrefix is normalised on save to never start
// with "/" and always end with "/" so callers can join freely.
type COSConfig struct {
	SecretID     string `json:"secret_id"`
	SecretKey    string `json:"secret_key"`
	Region       string `json:"region"`
	Bucket       string `json:"bucket"`
	KeyPrefix    string `json:"key_prefix,omitempty"`
	CustomDomain string `json:"custom_domain,omitempty"`
}

// COSConfigPath returns the on-disk path for the COS configuration file.
func COSConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "TextMind", "cos-config.json"), nil
}

// LoadCOSConfig reads the config. Missing files yield a zero-value config so
// first-run users see a blank form.
func LoadCOSConfig(path string) (COSConfig, error) {
	if path == "" {
		return COSConfig{}, errors.New("persist: empty COS config path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return COSConfig{}, nil
		}
		return COSConfig{}, err
	}
	var cfg COSConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return COSConfig{}, nil
	}
	return cfg, nil
}

// SaveCOSConfig writes the config atomically with mode 0o600.
func SaveCOSConfig(path string, cfg COSConfig) error {
	if path == "" {
		return errors.New("persist: empty COS config path")
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
