package main

import "github.com/wailsapp/wails/v2/pkg/runtime"

// browserOpen delegates to the Wails runtime. Kept in a separate file so
// app_plugins.go can be tested without dragging in the runtime.
func browserOpen(a *App, url string) {
	if a == nil || a.ctx == nil {
		return
	}
	runtime.BrowserOpenURL(a.ctx, url)
}
