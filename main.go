package main

import (
	"context"
	"embed"
	_ "embed"
	"io/fs"
	"log"
	"os"

	"TextMind/persist"
	"TextMind/pluginhost"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed frontend/dist
var frontendAssets embed.FS

// Version is the application version. Default ("dev") is overridden at build
// time via:
//
//	go build -ldflags "-X main.Version=v1.2.3"
//
// The release workflow injects the git tag here so the in-app updater can
// compare the running build against GitHub releases.
var Version = "dev"

// appWindowTitle is the window title, shared by the Wails window options and
// the single-instance raiseWindow (which locates the window by title).
const appWindowTitle = "TextMind"

func main() {
	logger := log.New(persist.NewLogWriter(), "[TextMind] ", log.Ldate|log.Ltime|log.Lshortfile)
	launchPaths := detectLaunchPaths(os.Args[1:])
	launchPath := ""
	if len(launchPaths) > 0 {
		launchPath = launchPaths[0]
	}

	// Enforce a single instance: if another TextMind is already running, hand
	// it any files we were launched with and exit without creating a window.
	// The running instance opens those files as new tabs.
	single, primary := Acquire()
	if !primary {
		// Best-effort forward of launch paths to the running instance. We exit 0
		// regardless of the outcome so this does not look like a failure to
		// anything that inspects the process's exit code (including Wails'
		// binding-generation step, which runs this same main in a subprocess).
		if !Forward(launchPaths) {
			logger.Printf("could not forward launch paths to running instance: %v", launchPaths)
		}
		os.Exit(0)
	}

	assetFS, err := fs.Sub(frontendAssets, "frontend/dist")
	if err != nil {
		log.Fatalf("failed to read frontend assets: %v", err)
	}

	app := NewApp(logger, launchPath)
	app.SetVersion(Version)
	app.singleInstance = single
	single.Serve(func(paths []string) { app.handleExternalOpen(paths) })

	// pluginhost is the seed for the Go-side plugin architecture. Built-in
	// modules currently live alongside the App receiver (so existing Wails
	// bindings keep working without regeneration) but new backend plugins
	// should register here so they participate in lifecycle, the Phase-3
	// bridge, etc.
	host := pluginhost.NewHost(logger)
	bridge := pluginhost.NewBridge()
	app.pluginHost = host
	app.pluginBridge = bridge
	registerBuiltinModules(host, app)

	err = wails.Run(&options.App{
		Title:     appWindowTitle,
		Width:     1000,
		Height:    760,
		MinWidth:  820,
		MinHeight: 560,
		AssetServer: &assetserver.Options{
			Assets: assetFS,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 20, A: 1},
		// Frameless removes the OS-native title bar so the frontend can render
		// a fully custom title bar (see components/TopBar.vue + WindowControls.vue).
		// Wails still provides edge resize hit-zones in this mode, so we
		// intentionally leave DisableResize unset.
		Frameless: true,
		Windows: &windows.Options{
			// Let the webview's own chrome (scrollbars, native context-menu
			// outline) follow the system; useThemeStore drives the active
			// app theme via WindowSetLightTheme / WindowSetDarkTheme at runtime.
			Theme: windows.SystemDefault,
		},
		OnStartup: app.startup,
		OnShutdown: func(ctx context.Context) {
			host.Shutdown(ctx)
			app.shutdown(ctx)
			single.Release()
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

// detectLaunchPaths collects every file argument passed on the command line
// (e.g. from double-clicking one or more files) that names an existing regular
// file. Directories and flag-like args are ignored. The first path is used as
// the initial launch path; all of them are forwarded to a running instance.
func detectLaunchPaths(args []string) []string {
	var paths []string
	for _, a := range args {
		p := a
		if p == "" || p[0] == '-' {
			continue
		}
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		paths = append(paths, p)
	}
	return paths
}
