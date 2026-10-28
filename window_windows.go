//go:build windows

package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// raiseWindow brings the TextMind window back into view when a second instance
// forwards files (e.g. double-clicking a file while the app is minimized or
// hidden behind other windows), so the user sees the new tab open.
//
// It operates on the app's own window through the Wails runtime context rather
// than locating the window by title, which is fragile (a frameless window's
// native title may not match a constant). The always-on-top toggle forces the
// window above others even when the OS foreground lock would deny a
// SetForegroundWindow call from a background process; dropping it back after a
// moment restores the normal z-order.
func raiseWindow(ctx context.Context) {
	if ctx == nil {
		return
	}
	runtime.WindowUnminimise(ctx)
	runtime.WindowShow(ctx)
	runtime.WindowSetAlwaysOnTop(ctx, true)
	runtime.WindowSetAlwaysOnTop(ctx, false)
}
