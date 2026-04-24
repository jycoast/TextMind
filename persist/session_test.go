package persist

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.json")

	s := &Session{
		NextTabSeq:    2,
		SelectedIndex: 1,
		Tabs: []TabSnapshot{
			{Title: "未命名 1", Text: "a\n", Language: "plaintext", Path: "", Dirty: false},
			{Title: "未命名 2", Text: "b", Language: "sql", Path: "E:/tmp/demo.sql", Dirty: true},
		},
		RecentFiles: []RecentFile{
			{Path: "E:/tmp/demo.sql", Name: "demo.sql", Language: "sql"},
			{Path: "E:/tmp/a.txt", Name: "a.txt", Language: "plaintext"},
		},
		WorkspaceRoot: "E:/tmp",
	}
	if err := Save(path, s); err != nil {
		t.Fatal(err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected session")
	}
	if got.NextTabSeq != 2 || got.SelectedIndex != 1 || len(got.Tabs) != 2 {
		t.Fatalf("got %+v", got)
	}
	if got.Tabs[0].Language != "plaintext" || got.Tabs[1].Language != "sql" {
		t.Fatalf("unexpected language restore: %+v", got.Tabs)
	}
	if got.Tabs[1].Path != "E:/tmp/demo.sql" {
		t.Fatalf("unexpected path restore: %+v", got.Tabs)
	}
	if !got.Tabs[1].Dirty {
		t.Fatalf("unexpected dirty restore: %+v", got.Tabs)
	}
	if len(got.RecentFiles) != 2 || got.RecentFiles[0].Name != "demo.sql" {
		t.Fatalf("unexpected recent files restore: %+v", got.RecentFiles)
	}
	if got.WorkspaceRoot != "E:/tmp" {
		t.Fatalf("unexpected workspace root restore: %q", got.WorkspaceRoot)
	}
}

func TestLoadMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "none.json")
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("want nil, got %+v", got)
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	_ = os.WriteFile(path, []byte("{"), 0o644)
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("want nil for bad json")
	}
}
