//go:build !windows

package main

// This file provides no-op stubs for non-Windows platforms so the package
// still compiles (e.g. `go test ./...` on macOS/Linux). TextMind is Windows-
// only in practice; the real implementation lives in singleinstance_windows.go.

type SingleInstance struct{}

// Acquire on non-Windows platforms always reports this process as the primary,
// so single-instance enforcement is simply skipped.
func Acquire() (*SingleInstance, bool) {
	return &SingleInstance{}, true
}

// Forward is a no-op on non-Windows platforms.
func Forward(paths []string) bool {
	return false
}

// Serve is a no-op on non-Windows platforms.
func (s *SingleInstance) Serve(onPaths func([]string)) {}

// Release is a no-op on non-Windows platforms.
func (s *SingleInstance) Release() {}
