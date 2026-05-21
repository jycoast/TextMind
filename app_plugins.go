package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// PluginManifestDTO mirrors the on-disk plugin.json that ships in every
// external plugin directory. Fields kept loose so plugins can evolve faster
// than the host.
type PluginManifestDTO struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Version         string   `json:"version"`
	Description     string   `json:"description,omitempty"`
	Author          string   `json:"author,omitempty"`
	EntryURL        string   `json:"entryUrl,omitempty"`
	Entry           string   `json:"entry,omitempty"`
	Permissions     []string `json:"permissions,omitempty"`
	ActivationEvents []string `json:"activationEvents,omitempty"`
	Builtin         bool     `json:"builtin"`
	Enabled         bool     `json:"enabled"`
	InstallPath     string   `json:"installPath,omitempty"`
	Error           string   `json:"error,omitempty"`
}

// PluginListDTO is the response shape of ListExternalPlugins.
type PluginListDTO struct {
	Plugins []PluginManifestDTO `json:"plugins"`
	Root    string              `json:"root"`
	Error   string              `json:"error,omitempty"`
}

// PluginStateDTO captures user-facing toggles persisted between sessions
// (which plugins to disable, etc.).
type PluginStateDTO struct {
	Disabled []string `json:"disabled,omitempty"`
}

type pluginStateFile struct {
	Disabled []string `json:"disabled,omitempty"`
}

// pluginsDir returns %AppData%/TextMind/plugins/ (or platform equivalent).
// Directory is created on first access so installers can drop files in.
func (a *App) pluginsDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "TextMind", "plugins")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (a *App) pluginStatePath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "TextMind")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "plugins-state.json"), nil
}

func (a *App) loadPluginState() pluginStateFile {
	path, err := a.pluginStatePath()
	if err != nil {
		return pluginStateFile{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return pluginStateFile{}
	}
	var st pluginStateFile
	if err := json.Unmarshal(data, &st); err != nil {
		return pluginStateFile{}
	}
	return st
}

func (a *App) savePluginState(st pluginStateFile) error {
	path, err := a.pluginStatePath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func disabledSet(state pluginStateFile) map[string]bool {
	out := map[string]bool{}
	for _, id := range state.Disabled {
		out[strings.TrimSpace(id)] = true
	}
	return out
}

// ListExternalPlugins enumerates every plugin under the plugins directory.
// Each subdirectory should contain a plugin.json manifest; subdirectories
// without one are skipped (with a logged warning).
func (a *App) ListExternalPlugins() PluginListDTO {
	root, err := a.pluginsDir()
	if err != nil {
		return PluginListDTO{Error: err.Error()}
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return PluginListDTO{Root: root, Error: err.Error()}
	}
	state := a.loadPluginState()
	disabled := disabledSet(state)

	out := PluginListDTO{Root: root, Plugins: []PluginManifestDTO{}}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		manifest, err := readPluginManifest(filepath.Join(root, e.Name()))
		if err != nil {
			out.Plugins = append(out.Plugins, PluginManifestDTO{
				ID:          e.Name(),
				Name:        e.Name(),
				InstallPath: filepath.Join(root, e.Name()),
				Error:       err.Error(),
			})
			continue
		}
		manifest.InstallPath = filepath.Join(root, e.Name())
		manifest.Enabled = !disabled[manifest.ID]
		out.Plugins = append(out.Plugins, manifest)
	}
	return out
}

func readPluginManifest(dir string) (PluginManifestDTO, error) {
	path := filepath.Join(dir, "plugin.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return PluginManifestDTO{}, err
	}
	var m PluginManifestDTO
	if err := json.Unmarshal(data, &m); err != nil {
		return PluginManifestDTO{}, err
	}
	if strings.TrimSpace(m.ID) == "" {
		return PluginManifestDTO{}, errors.New("plugin.json missing id")
	}
	return m, nil
}

// ReadPluginFile returns the raw contents of a file inside an external plugin
// directory. The relative path is sanitized to prevent escaping the plugin's
// own folder.
func (a *App) ReadPluginFile(pluginID, relative string) string {
	root, err := a.pluginsDir()
	if err != nil {
		return ""
	}
	clean := filepath.Clean(strings.ReplaceAll(relative, "\\", "/"))
	if strings.Contains(clean, "..") {
		return ""
	}
	target := filepath.Join(root, pluginID, clean)
	data, err := os.ReadFile(target)
	if err != nil {
		return ""
	}
	return string(data)
}

// SetExternalPluginEnabled flips the disabled flag for a plugin id and
// persists the change. Takes effect on next app start (or after a manual
// reload from the Plugins settings page).
func (a *App) SetExternalPluginEnabled(pluginID string, enabled bool) SimpleResult {
	id := strings.TrimSpace(pluginID)
	if id == "" {
		return SimpleResult{Error: "plugin id is empty"}
	}
	state := a.loadPluginState()
	cur := map[string]bool{}
	for _, d := range state.Disabled {
		cur[d] = true
	}
	if enabled {
		delete(cur, id)
	} else {
		cur[id] = true
	}
	state.Disabled = make([]string, 0, len(cur))
	for d := range cur {
		state.Disabled = append(state.Disabled, d)
	}
	if err := a.savePluginState(state); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// UninstallExternalPlugin removes a plugin directory entirely. Use with care.
func (a *App) UninstallExternalPlugin(pluginID string) SimpleResult {
	id := strings.TrimSpace(pluginID)
	if id == "" {
		return SimpleResult{Error: "plugin id is empty"}
	}
	root, err := a.pluginsDir()
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	target := filepath.Join(root, id)
	info, err := os.Stat(target)
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	if !info.IsDir() {
		return SimpleResult{Error: "plugin path is not a directory"}
	}
	if err := os.RemoveAll(target); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// PluginCallResult is the wails-bound response shape of PluginCall.
type PluginCallResult struct {
	OK     bool        `json:"ok"`
	Error  string      `json:"error,omitempty"`
	Result interface{} `json:"result,omitempty"`
}

// PluginCall is the JSON-RPC-style entry point external plugins use to call
// host-provided methods. The bridge enforces per-plugin permissions; built-in
// plugins are trusted by default.
//
// payload is the raw JSON payload as a string so the wails binding stays
// purely string-based (avoids regenerating types when methods evolve).
func (a *App) PluginCall(pluginID, method, payload string) PluginCallResult {
	if a.pluginBridge == nil {
		return PluginCallResult{Error: "plugin bridge unavailable"}
	}
	id := strings.TrimSpace(pluginID)
	if id == "" {
		return PluginCallResult{Error: "pluginId is empty"}
	}
	out, err := a.pluginBridge.Call(id, method, []byte(payload))
	if err != nil {
		return PluginCallResult{Error: err.Error()}
	}
	return PluginCallResult{OK: true, Result: out}
}

// GrantPluginPermissions is called by the Plugins settings UI after the user
// confirms a permission prompt. It updates the in-memory bridge grant set;
// persistence between sessions can be wired into plugins-state.json later.
func (a *App) GrantPluginPermissions(pluginID string, permissions []string) SimpleResult {
	if a.pluginBridge == nil {
		return SimpleResult{Error: "plugin bridge unavailable"}
	}
	id := strings.TrimSpace(pluginID)
	if id == "" {
		return SimpleResult{Error: "pluginId is empty"}
	}
	a.pluginBridge.Grant(id, permissions...)
	return SimpleResult{OK: true}
}

// OpenPluginsDir opens the plugins root in the system file browser.
func (a *App) OpenPluginsDir() {
	if a.ctx == nil {
		return
	}
	root, err := a.pluginsDir()
	if err != nil {
		return
	}
	// Use OpenLogDir's approach (it just runs BrowserOpenURL with file://).
	// We replicate inline so we don't depend on currentDir().
	url := "file:///" + strings.ReplaceAll(root, "\\", "/")
	openURL(a, url)
}

// openURL is a thin wrapper around runtime.BrowserOpenURL kept here so the
// rest of app_plugins.go has no Wails import (testability).
var openURL = func(a *App, url string) {
	browserOpen(a, url)
}
