package main

import (
	"embed"
	_ "embed"
	"io"
	"io/fs"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed frontend/dist
var frontendAssets embed.FS


func main() {
	logger := log.New(io.Discard, "", 0)
	launchPath := detectLaunchPath(os.Args[1:])

	assetFS, err := fs.Sub(frontendAssets, "frontend/dist")
	if err != nil {
		log.Fatalf("failed to read frontend assets: %v", err)
	}

	app := NewApp(logger, launchPath)
	err = wails.Run(&options.App{
		Title:     "TextMind",
		Width:     1000,
		Height:    760,
		MinWidth:  820,
		MinHeight: 560,
		AssetServer: &assetserver.Options{
			Assets: assetFS,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 20, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

func detectLaunchPath(args []string) string {
	for _, a := range args {
		p := a
		if p == "" || p[0] == '-' {
			continue
		}
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		return p
	}
	return ""
}

