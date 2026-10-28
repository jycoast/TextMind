//go:build !windows

package main

import "context"

// raiseWindow is a no-op on non-Windows platforms. TextMind is Windows-only in
// practice; the real implementation lives in window_windows.go.
func raiseWindow(_ context.Context) {}
