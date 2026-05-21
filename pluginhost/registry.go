// Package pluginhost is the Go-side scaffolding for the plugin architecture.
//
// Built-in plugins implement Module so they can attach state to the host App
// and (in Phase 3) participate in the cross-process bridge. The host keeps a
// list of registered modules and delegates lifecycle to them. Today every
// module is statically linked; Wasm or out-of-process modules can be added
// later without breaking this API.
package pluginhost

import (
	"context"
	"log"
	"sync"
)

// Module is the minimum contract a backend plugin must implement. ID is the
// canonical plugin identifier (matches the frontend manifest id); Register is
// called once during startup so the module can wire its own resources.
type Module interface {
	ID() string
	Register(host *Host) error
}

// ShutdownAware is an optional Module extension. When implemented, Shutdown
// is called during application shutdown so the module can release goroutines,
// flush pending writes, etc.
type ShutdownAware interface {
	Shutdown(ctx context.Context)
}

// Host carries cross-module services. It is intentionally tiny right now: a
// logger plus a registry of activated modules. Wails bindings are still
// surfaced through main.App; modules either talk to App directly (via their
// own constructor) or - for Phase 3 third-party plugins - through PluginCall.
type Host struct {
	mu      sync.RWMutex
	modules map[string]Module
	logger  *log.Logger
}

// NewHost creates a fresh Host. Pass a nil logger to silence module-level
// messages; modules should be defensive against a nil logger anyway.
func NewHost(logger *log.Logger) *Host {
	return &Host{
		modules: map[string]Module{},
		logger:  logger,
	}
}

// Logger returns the host logger (never nil; falls back to a no-op).
func (h *Host) Logger() *log.Logger {
	if h.logger != nil {
		return h.logger
	}
	return log.Default()
}

// Register adds a module and immediately calls its Register hook. Duplicate
// ids return an error so configuration mistakes surface loudly at startup.
func (h *Host) Register(mod Module) error {
	h.mu.Lock()
	if _, exists := h.modules[mod.ID()]; exists {
		h.mu.Unlock()
		return &alreadyRegisteredErr{ID: mod.ID()}
	}
	h.modules[mod.ID()] = mod
	h.mu.Unlock()
	return mod.Register(h)
}

// MustRegister is the panicking counterpart of Register; useful in main().
func (h *Host) MustRegister(mod Module) {
	if err := h.Register(mod); err != nil {
		panic(err)
	}
}

// Get returns a registered module by id (nil when missing).
func (h *Host) Get(id string) Module {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.modules[id]
}

// List returns all registered modules in insertion order indeterminate (map
// iteration). Callers that need a stable order should sort by ID() themselves.
func (h *Host) List() []Module {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]Module, 0, len(h.modules))
	for _, m := range h.modules {
		out = append(out, m)
	}
	return out
}

// Shutdown invokes Shutdown on every module that opted into ShutdownAware.
// Errors are logged but never returned; shutdown is best-effort.
func (h *Host) Shutdown(ctx context.Context) {
	for _, mod := range h.List() {
		if s, ok := mod.(ShutdownAware); ok {
			func() {
				defer func() {
					if r := recover(); r != nil {
						h.Logger().Printf("pluginhost: shutdown %s panicked: %v", mod.ID(), r)
					}
				}()
				s.Shutdown(ctx)
			}()
		}
	}
}

type alreadyRegisteredErr struct{ ID string }

func (e *alreadyRegisteredErr) Error() string {
	return "pluginhost: module already registered: " + e.ID
}
