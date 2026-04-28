package persist

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestSaveLoadAIConfig_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-config.json")
	cfg := AIConfig{
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
		DefaultModel: "gpt-4o-mini",
		Models:       []string{"gpt-4o-mini", "gpt-4o"},
		SystemPrompt: "Be concise.",
	}
	if err := SaveAIConfig(path, cfg); err != nil {
		t.Fatalf("SaveAIConfig: %v", err)
	}
	got, err := LoadAIConfig(path)
	if err != nil {
		t.Fatalf("LoadAIConfig: %v", err)
	}
	if !reflect.DeepEqual(got, cfg) {
		t.Errorf("round-trip mismatch:\n got = %+v\nwant = %+v", got, cfg)
	}
}

func TestSaveAIConfig_Permissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits not enforced on Windows")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-config.json")
	if err := SaveAIConfig(path, AIConfig{APIKey: "secret"}); err != nil {
		t.Fatalf("SaveAIConfig: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Errorf("mode = %v, want 0600", mode)
	}
}

func TestLoadAIConfig_MissingFile(t *testing.T) {
	dir := t.TempDir()
	cfg, err := LoadAIConfig(filepath.Join(dir, "nope.json"))
	if err != nil {
		t.Fatalf("expected nil error for missing file, got %v", err)
	}
	if !reflect.DeepEqual(cfg, AIConfig{}) {
		t.Errorf("expected zero AIConfig, got %+v", cfg)
	}
}

func TestLoadAIConfig_CorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-config.json")
	if err := os.WriteFile(path, []byte("not json"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	cfg, err := LoadAIConfig(path)
	if err != nil {
		t.Fatalf("expected nil error for corrupt file, got %v", err)
	}
	if !reflect.DeepEqual(cfg, AIConfig{}) {
		t.Errorf("expected zero AIConfig from corrupt file, got %+v", cfg)
	}
}

func TestSaveAIConfig_EmptyPath(t *testing.T) {
	if err := SaveAIConfig("", AIConfig{}); err == nil {
		t.Error("expected error for empty path")
	}
	if _, err := LoadAIConfig(""); err == nil {
		t.Error("expected error for empty path")
	}
}
