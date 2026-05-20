package main

import (
	"log"

	"TextMind/persist"
)

// KeymapConfigDTO is the wails-bound shape of the keymap configuration.
// The frontend treats an empty string in Bindings as "explicitly unbound";
// missing ActionId keys fall back to the built-in defaults at the JS layer.
type KeymapConfigDTO struct {
	Bindings map[string]string `json:"bindings"`
}

func keymapConfigFilePath(logger *log.Logger) string {
	p, err := persist.KeymapConfigPath()
	if err != nil {
		logger.Printf("user config dir unavailable, using local keymap.json: %v", err)
		return "TextMind-keymap.json"
	}
	return p
}

// GetKeymapConfig returns the persisted keymap overrides. A first-run user
// receives an empty Bindings map; the frontend then renders the defaults.
func (a *App) GetKeymapConfig() KeymapConfigDTO {
	cfg, err := persist.LoadKeymapConfig(a.keymapConfigPath)
	if err != nil {
		a.logger.Printf("keymap: load config: %v", err)
	}
	if cfg.Bindings == nil {
		cfg.Bindings = map[string]string{}
	}
	return KeymapConfigDTO{Bindings: cfg.Bindings}
}

// SaveKeymapConfig persists the supplied bindings to disk atomically.
func (a *App) SaveKeymapConfig(dto KeymapConfigDTO) SimpleResult {
	bindings := dto.Bindings
	if bindings == nil {
		bindings = map[string]string{}
	}
	if err := persist.SaveKeymapConfig(a.keymapConfigPath, persist.KeymapConfig{Bindings: bindings}); err != nil {
		a.logger.Printf("keymap: save config: %v", err)
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}
