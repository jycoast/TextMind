package main

import (
	"context"

	"TextMind/pluginhost"
)

// registerBuiltinModules installs every backend-side built-in plugin against
// the host. New built-ins should be appended here. For now we only register
// thin module wrappers around App; future modules can own their own state
// (see pkg/plugins/* in the architecture doc).
func registerBuiltinModules(host *pluginhost.Host, app *App) {
	host.MustRegister(&textOpsModule{app: app})
	host.MustRegister(&jsonModule{app: app})
	host.MustRegister(&aiModule{app: app})
	host.MustRegister(&updaterModule{app: app})
	host.MustRegister(&shortcutsModule{app: app})

	// Built-in plugins implicitly trust the host bridge so they can call
	// any future PluginCall-routed method without permission checks.
	if app.pluginBridge != nil {
		for _, m := range host.List() {
			app.pluginBridge.Trust(m.ID())
		}
	}
}

// textOpsModule wraps dedupe / extract / inlist endpoints already bound on
// App. Future iterations can migrate the method bodies into this module.
type textOpsModule struct{ app *App }

func (m *textOpsModule) ID() string                      { return "textmind.text-tools" }
func (m *textOpsModule) Register(_ *pluginhost.Host) error { return nil }

type jsonModule struct{ app *App }

func (m *jsonModule) ID() string                      { return "textmind.json" }
func (m *jsonModule) Register(_ *pluginhost.Host) error { return nil }

type aiModule struct{ app *App }

func (m *aiModule) ID() string                      { return "textmind.ai" }
func (m *aiModule) Register(_ *pluginhost.Host) error { return nil }
func (m *aiModule) Shutdown(_ context.Context)       { m.app.aiStreams.cancelAll() }

type updaterModule struct{ app *App }

func (m *updaterModule) ID() string                      { return "textmind.updater" }
func (m *updaterModule) Register(_ *pluginhost.Host) error { return nil }

type shortcutsModule struct{ app *App }

func (m *shortcutsModule) ID() string                      { return "textmind.shortcuts" }
func (m *shortcutsModule) Register(_ *pluginhost.Host) error { return nil }
