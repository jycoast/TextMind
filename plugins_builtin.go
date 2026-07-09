package main

import (
	"context"
	"encoding/json"

	"TextMind/extract"
	"TextMind/pluginhost"
)

// registerBuiltinModules installs every backend-side built-in plugin against
// the host and wires up their PluginCall bridge methods so external plugins
// can access backend capabilities.
func registerBuiltinModules(host *pluginhost.Host, app *App) {
	host.MustRegister(&textOpsModule{app: app})
	host.MustRegister(&jsonModule{app: app})
	host.MustRegister(&aiModule{app: app})
	host.MustRegister(&updaterModule{app: app})
	host.MustRegister(&shortcutsModule{app: app})
	host.MustRegister(&fsModule{app: app})

	if app.pluginBridge != nil {
		for _, m := range host.List() {
			app.pluginBridge.Trust(m.ID())
		}
	}
}

// ---------------------------------------------------------------------------
// textOpsModule — dedupe / extract / inlist
// ---------------------------------------------------------------------------

type textOpsModule struct{ app *App }

func (m *textOpsModule) ID() string { return "textmind.text-tools" }
func (m *textOpsModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("text.dedupe", func(payload json.RawMessage) (any, error) {
		var p struct{ Text string `json:"text"` }
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.DedupeSelected(p.Text), nil
	})

	b.RegisterMethod("text.singleton", func(payload json.RawMessage) (any, error) {
		var p struct{ Text string `json:"text"` }
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.KeepSingletonSelected(p.Text), nil
	})

	b.RegisterMethod("text.duplicates", func(payload json.RawMessage) (any, error) {
		var p struct{ Text string `json:"text"` }
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.KeepDuplicateSelected(p.Text), nil
	})

	b.RegisterMethod("text.inlist", func(payload json.RawMessage) (any, error) {
		var p struct{ Text string `json:"text"` }
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.ToInListSelected(p.Text), nil
	})

	b.RegisterMethod("text.extract", func(payload json.RawMessage) (any, error) {
		var p struct {
			Text    string          `json:"text"`
			Options extract.Options `json:"options"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.ExtractFromText(p.Text, p.Options), nil
	})

	return nil
}

// ---------------------------------------------------------------------------
// jsonModule — JSON format/compact (available to external plugins via bridge)
// ---------------------------------------------------------------------------

type jsonModule struct{ app *App }

func (m *jsonModule) ID() string { return "textmind.json" }
func (m *jsonModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("json.format", func(payload json.RawMessage) (any, error) {
		var p struct {
			Text   string `json:"text"`
			Indent int    `json:"indent"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		indent := "  "
		if p.Indent > 0 {
			buf := make([]byte, p.Indent)
			for i := range buf {
				buf[i] = ' '
			}
			indent = string(buf)
		}
		var raw json.RawMessage
		if err := json.Unmarshal([]byte(p.Text), &raw); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}, nil
		}
		out, err := json.MarshalIndent(raw, "", indent)
		if err != nil {
			return map[string]any{"ok": false, "error": err.Error()}, nil
		}
		return map[string]any{"ok": true, "text": string(out)}, nil
	})

	b.RegisterMethod("json.compact", func(payload json.RawMessage) (any, error) {
		var p struct{ Text string `json:"text"` }
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		var raw json.RawMessage
		if err := json.Unmarshal([]byte(p.Text), &raw); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}, nil
		}
		out, err := json.Marshal(raw)
		if err != nil {
			return map[string]any{"ok": false, "error": err.Error()}, nil
		}
		return map[string]any{"ok": true, "text": string(out)}, nil
	})

	return nil
}

// ---------------------------------------------------------------------------
// aiModule — AI model listing & connection test
// ---------------------------------------------------------------------------

type aiModule struct{ app *App }

func (m *aiModule) ID() string { return "textmind.ai" }
func (m *aiModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("ai.fetchModels", func(payload json.RawMessage) (any, error) {
		var dto AIConfigDTO
		if err := json.Unmarshal(payload, &dto); err != nil {
			return nil, err
		}
		return m.app.FetchAIModels(dto), nil
	}, "ai.chat")

	b.RegisterMethod("ai.testConnection", func(payload json.RawMessage) (any, error) {
		var dto AIConfigDTO
		if err := json.Unmarshal(payload, &dto); err != nil {
			return nil, err
		}
		return m.app.TestAIConnection(dto), nil
	}, "ai.chat")

	return nil
}

func (m *aiModule) Shutdown(_ context.Context) { m.app.aiStreams.cancelAll() }

// ---------------------------------------------------------------------------
// updaterModule
// ---------------------------------------------------------------------------

type updaterModule struct{ app *App }

func (m *updaterModule) ID() string { return "textmind.updater" }
func (m *updaterModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("updater.checkForUpdate", func(_ json.RawMessage) (any, error) {
		return m.app.CheckForUpdate(), nil
	})

	b.RegisterMethod("updater.getVersion", func(_ json.RawMessage) (any, error) {
		return map[string]string{"version": m.app.GetAppVersion()}, nil
	})

	return nil
}

// ---------------------------------------------------------------------------
// shortcutsModule
// ---------------------------------------------------------------------------

type shortcutsModule struct{ app *App }

func (m *shortcutsModule) ID() string { return "textmind.shortcuts" }
func (m *shortcutsModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("shortcuts.get", func(_ json.RawMessage) (any, error) {
		return m.app.GetKeymapConfig(), nil
	})

	b.RegisterMethod("shortcuts.save", func(payload json.RawMessage) (any, error) {
		var dto KeymapConfigDTO
		if err := json.Unmarshal(payload, &dto); err != nil {
			return nil, err
		}
		return m.app.SaveKeymapConfig(dto), nil
	})

	return nil
}

// ---------------------------------------------------------------------------
// fsModule — file read/write for external plugins
// ---------------------------------------------------------------------------

type fsModule struct{ app *App }

func (m *fsModule) ID() string { return "textmind.fs" }
func (m *fsModule) Register(_ *pluginhost.Host) error {
	b := m.app.pluginBridge
	if b == nil {
		return nil
	}

	b.RegisterMethod("fs.readFile", func(payload json.RawMessage) (any, error) {
		var p struct {
			Path     string `json:"path"`
			Encoding string `json:"encoding"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.OpenTextFileByPathWithEncoding(p.Path, p.Encoding), nil
	}, "fs.read")

	b.RegisterMethod("fs.writeFile", func(payload json.RawMessage) (any, error) {
		var p struct {
			Path     string `json:"path"`
			Text     string `json:"text"`
			Encoding string `json:"encoding"`
			WithBOM  bool   `json:"withBOM"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return nil, err
		}
		return m.app.SaveTextFileWithEncoding(p.Path, p.Text, p.Encoding, p.WithBOM), nil
	}, "fs.write")

	return nil
}
