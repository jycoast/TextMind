package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveMarkdownLink(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "docs", "guide.md")
	target := filepath.Join(dir, "notes", "next.md")
	if err := os.MkdirAll(filepath.Dir(doc), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("# 下一步"), 0o644); err != nil {
		t.Fatal(err)
	}

	result := (&App{}).ResolveMarkdownLink(doc, "../notes/next.md#下一步")
	if result.Error != "" {
		t.Fatalf("ResolveMarkdownLink error = %q", result.Error)
	}
	if result.Path != target || result.Fragment != "下一步" {
		t.Fatalf("ResolveMarkdownLink = %#v", result)
	}
}

func TestResolveMarkdownImage(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "guide.md")
	imagePath := filepath.Join(dir, "assets", "pixel.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatal(err)
	}
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(imagePath, png, 0o644); err != nil {
		t.Fatal(err)
	}

	result := (&App{}).ResolveMarkdownImage(doc, "assets/pixel.png")
	if result.Error != "" {
		t.Fatalf("ResolveMarkdownImage error = %q", result.Error)
	}
	if result.Path != imagePath || !strings.HasPrefix(result.DataURL, "data:image/png;base64,") {
		t.Fatalf("ResolveMarkdownImage = %#v", result)
	}
}

func TestResolveMarkdownImageRejectsNonImage(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "guide.md")
	textPath := filepath.Join(dir, "secret.txt")
	if err := os.WriteFile(textPath, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	result := (&App{}).ResolveMarkdownImage(doc, "secret.txt")
	if result.Error == "" {
		t.Fatal("ResolveMarkdownImage unexpectedly accepted a non-image")
	}
}

func TestResolveMarkdownPathRejectsRemoteReference(t *testing.T) {
	_, _, err := resolveMarkdownPath(`C:\docs\guide.md`, "https://example.com/a.png")
	if err == nil {
		t.Fatal("resolveMarkdownPath unexpectedly accepted a remote reference")
	}
}

func TestMarkdownPDFName(t *testing.T) {
	for _, test := range []struct {
		input string
		want  string
	}{
		{"guide.md", "guide.pdf"},
		{"report.markdown", "report.pdf"},
		{"document", "document.pdf"},
		{"report.v1", "report.v1.pdf"},
		{"", "document.pdf"},
	} {
		if got := markdownPDFName(test.input); got != test.want {
			t.Fatalf("markdownPDFName(%q) = %q, want %q", test.input, got, test.want)
		}
	}
}

func TestMarkdownHTMLFileURL(t *testing.T) {
	got := markdownHTMLFileURL(`C:\Temp\My guide.html`)
	if got != "file:///C:/Temp/My%20guide.html" {
		t.Fatalf("markdownHTMLFileURL = %q", got)
	}
}

func TestEdgeCanPrintStandaloneHTML(t *testing.T) {
	edge, err := findEdgeExecutable()
	if err != nil {
		t.Skip(err)
	}
	dir := t.TempDir()
	htmlPath := filepath.Join(dir, "document.html")
	pdfPath := filepath.Join(dir, "document.pdf")
	profilePath := filepath.Join(dir, "edge-profile")
	if err := os.MkdirAll(profilePath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(htmlPath, []byte("<!doctype html><meta charset=utf-8><h1>TextMind PDF</h1>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := printHTMLToPDF(edge, profilePath, htmlPath, pdfPath); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(pdfPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 4 || string(data[:4]) != "%PDF" {
		t.Fatalf("generated file is not a PDF: %q", data[:min(4, len(data))])
	}
}
