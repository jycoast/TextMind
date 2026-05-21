package pluginhost

import (
	"encoding/json"
	"errors"
	"sync"
)

// MethodHandler is the signature for a backend method exposed to (Phase 3)
// third-party plugins. The handler receives the raw JSON payload and returns
// a JSON-encodable value or an error.
type MethodHandler func(payload json.RawMessage) (any, error)

// Bridge is the dispatcher behind the App.PluginCall Wails binding. Built-in
// modules register named methods with namespaced ids (e.g. "ai.fetchModels");
// the bridge validates the call against a permission table before invoking
// the handler. Built-in plugins skip permission checks because they are
// statically trusted.
//
// The permission model is intentionally simple: a method id is associated
// with one or more permission tags, and each plugin id is associated with a
// set of granted tags. A call is allowed iff every permission tag attached
// to the method appears in the plugin's grant set (or the plugin is fully
// trusted).
type Bridge struct {
	mu           sync.RWMutex
	methods      map[string]MethodHandler
	methodPerms  map[string][]string
	allowAll     map[string]bool     // plugin ids treated as trusted (built-ins)
	pluginGrants map[string]grantSet // plugin id -> set of granted tags
}

type grantSet map[string]struct{}

// NewBridge creates an empty bridge.
func NewBridge() *Bridge {
	return &Bridge{
		methods:      map[string]MethodHandler{},
		methodPerms:  map[string][]string{},
		allowAll:     map[string]bool{},
		pluginGrants: map[string]grantSet{},
	}
}

// Trust marks a plugin id as fully trusted (skips permission checks). Used
// for built-in plugins that ship with the binary.
func (b *Bridge) Trust(pluginID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.allowAll[pluginID] = true
}

// Grant adds permission tags to a plugin id. Tags are case-sensitive; common
// examples: "fs.read", "ai.chat", "net.fetch".
func (b *Bridge) Grant(pluginID string, tags ...string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	set, ok := b.pluginGrants[pluginID]
	if !ok {
		set = grantSet{}
		b.pluginGrants[pluginID] = set
	}
	for _, t := range tags {
		set[t] = struct{}{}
	}
}

// Revoke removes one tag from a plugin id; the plugin loses that permission
// on the next Call().
func (b *Bridge) Revoke(pluginID, tag string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if set, ok := b.pluginGrants[pluginID]; ok {
		delete(set, tag)
	}
}

// RegisterMethod publishes a method id ("plugin.method" form recommended).
// requiredPerms is the set of permission tags the caller must hold; pass
// nothing for methods that any plugin may call. Returns an error when the
// id is already taken.
func (b *Bridge) RegisterMethod(id string, handler MethodHandler, requiredPerms ...string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, exists := b.methods[id]; exists {
		return errors.New("pluginhost: method already registered: " + id)
	}
	b.methods[id] = handler
	if len(requiredPerms) > 0 {
		copyPerms := make([]string, len(requiredPerms))
		copy(copyPerms, requiredPerms)
		b.methodPerms[id] = copyPerms
	}
	return nil
}

// Call dispatches a JSON-RPC-style call. pluginID identifies the caller; the
// bridge checks that every required permission for the method is granted to
// the caller (trusted plugins bypass the check). payload is opaque JSON
// forwarded to the handler.
func (b *Bridge) Call(pluginID, method string, payload json.RawMessage) (any, error) {
	b.mu.RLock()
	handler, ok := b.methods[method]
	required := b.methodPerms[method]
	trusted := b.allowAll[pluginID]
	grants := b.pluginGrants[pluginID]
	b.mu.RUnlock()
	if !ok {
		return nil, errors.New("pluginhost: unknown method: " + method)
	}
	if !trusted {
		for _, tag := range required {
			if _, granted := grants[tag]; !granted {
				return nil, errors.New(
					"pluginhost: permission denied (" + tag + ") for " + pluginID,
				)
			}
		}
	}
	return handler(payload)
}

// Methods returns all registered method ids (for diagnostics / settings UI).
func (b *Bridge) Methods() []string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]string, 0, len(b.methods))
	for id := range b.methods {
		out = append(out, id)
	}
	return out
}
