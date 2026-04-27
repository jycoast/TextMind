package extract

import "testing"

func TestRunRejectsEmptyPattern(t *testing.T) {
	got := Run("a\nb", Options{Mode: ModeFilter, Pattern: "  "})
	if got.Error == "" {
		t.Fatalf("expected error for empty pattern, got: %+v", got)
	}
}

func TestRunRejectsUnknownMode(t *testing.T) {
	got := Run("a\nb", Options{Mode: "weird", Pattern: "x"})
	if got.Error == "" {
		t.Fatalf("expected error for unknown mode, got: %+v", got)
	}
}

func TestFilterKeywordMatch(t *testing.T) {
	input := "INFO start\nERROR boom\nINFO done"
	got := Run(input, Options{Mode: ModeFilter, Pattern: "ERROR"})
	if got.Error != "" {
		t.Fatalf("unexpected error: %s", got.Error)
	}
	if got.Text != "ERROR boom" {
		t.Fatalf("Text = %q, want %q", got.Text, "ERROR boom")
	}
	if got.MatchCount != 1 || got.LineCount != 1 {
		t.Fatalf("counts = (%d,%d), want (1,1)", got.MatchCount, got.LineCount)
	}
}

func TestFilterRegexMatch(t *testing.T) {
	input := "v1.2.3\nbeta\nv2.0.0"
	got := Run(input, Options{
		Mode:     ModeFilter,
		Pattern:  `^v\d+\.`,
		UseRegex: true,
	})
	if got.Error != "" {
		t.Fatalf("unexpected error: %s", got.Error)
	}
	if got.Text != "v1.2.3\nv2.0.0" {
		t.Fatalf("Text = %q", got.Text)
	}
}

func TestFilterCaseInsensitiveKeyword(t *testing.T) {
	input := "ERROR a\nerror b\nwarn c"
	got := Run(input, Options{
		Mode:            ModeFilter,
		Pattern:         "error",
		CaseInsensitive: true,
	})
	if got.Text != "ERROR a\nerror b" {
		t.Fatalf("Text = %q", got.Text)
	}
}

func TestFilterInvert(t *testing.T) {
	input := "keep me\ndrop\nkeep too"
	got := Run(input, Options{
		Mode:    ModeFilter,
		Pattern: "drop",
		Invert:  true,
	})
	if got.Text != "keep me\nkeep too" {
		t.Fatalf("Text = %q", got.Text)
	}
	if got.MatchCount != 2 {
		t.Fatalf("MatchCount = %d, want 2", got.MatchCount)
	}
}

func TestFilterDedup(t *testing.T) {
	input := "ERROR a\nERROR a\nERROR b"
	got := Run(input, Options{
		Mode:    ModeFilter,
		Pattern: "ERROR",
		Dedup:   true,
	})
	if got.Text != "ERROR a\nERROR b" {
		t.Fatalf("Text = %q", got.Text)
	}
	if got.MatchCount != 3 || got.LineCount != 2 {
		t.Fatalf("counts = (%d,%d), want (3,2)", got.MatchCount, got.LineCount)
	}
}

func TestFilterRejectsBadRegex(t *testing.T) {
	got := Run("a", Options{Mode: ModeFilter, Pattern: "(", UseRegex: true})
	if got.Error == "" {
		t.Fatalf("expected error for bad regex")
	}
}

func TestCaptureSingleGroup(t *testing.T) {
	input := "id=42 name=foo\nid=7 name=bar"
	got := Run(input, Options{
		Mode:         ModeCapture,
		Pattern:      `id=(\d+)`,
		UseRegex:     true,
		CaptureGroup: 1,
	})
	if got.Error != "" {
		t.Fatalf("unexpected error: %s", got.Error)
	}
	if got.Text != "42\n7" {
		t.Fatalf("Text = %q", got.Text)
	}
	if got.MatchCount != 2 {
		t.Fatalf("MatchCount = %d", got.MatchCount)
	}
}

func TestCaptureGroupZeroIsFullMatch(t *testing.T) {
	input := "abc 123 def 45"
	got := Run(input, Options{
		Mode:         ModeCapture,
		Pattern:      `\d+`,
		UseRegex:     true,
		CaptureGroup: 0,
	})
	if got.Text != "123\n45" {
		t.Fatalf("Text = %q", got.Text)
	}
}

func TestCaptureGroupOutOfRange(t *testing.T) {
	got := Run("a", Options{
		Mode:         ModeCapture,
		Pattern:      `(a)`,
		UseRegex:     true,
		CaptureGroup: 5,
	})
	if got.Error == "" {
		t.Fatalf("expected error for out-of-range group")
	}
}

func TestCaptureCustomJoinerAndDedup(t *testing.T) {
	input := "x=1 x=2 x=1 x=3"
	got := Run(input, Options{
		Mode:         ModeCapture,
		Pattern:      `x=(\d+)`,
		UseRegex:     true,
		CaptureGroup: 1,
		Joiner:       ",",
		Dedup:        true,
	})
	if got.Text != "1,2,3" {
		t.Fatalf("Text = %q", got.Text)
	}
	if got.MatchCount != 4 || got.LineCount != 3 {
		t.Fatalf("counts = (%d,%d), want (4,3)", got.MatchCount, got.LineCount)
	}
}

func TestBlockWithExplicitEnd(t *testing.T) {
	input := "line1\nBEGIN\nbody1\nbody2\nEND\nafter\nBEGIN\nonly\nEND\n"
	got := Run(input, Options{
		Mode:     ModeBlock,
		Pattern:  "^BEGIN$",
		BlockEnd: "^END$",
		UseRegex: true,
	})
	if got.Error != "" {
		t.Fatalf("unexpected error: %s", got.Error)
	}
	want := "body1\nbody2\n\nonly"
	if got.Text != want {
		t.Fatalf("Text = %q, want %q", got.Text, want)
	}
	if got.MatchCount != 2 {
		t.Fatalf("MatchCount = %d, want 2", got.MatchCount)
	}
}

func TestBlockIncludeBoundary(t *testing.T) {
	input := "BEGIN\nbody\nEND\n"
	got := Run(input, Options{
		Mode:            ModeBlock,
		Pattern:         "^BEGIN$",
		BlockEnd:        "^END$",
		UseRegex:        true,
		IncludeBoundary: true,
	})
	want := "BEGIN\nbody\nEND"
	if got.Text != want {
		t.Fatalf("Text = %q, want %q", got.Text, want)
	}
}

func TestBlockMissingEndFlushesAtEOF(t *testing.T) {
	input := "BEGIN\nbody1\nbody2"
	got := Run(input, Options{
		Mode:     ModeBlock,
		Pattern:  "^BEGIN$",
		BlockEnd: "^END$",
		UseRegex: true,
	})
	if got.Text != "body1\nbody2" {
		t.Fatalf("Text = %q", got.Text)
	}
}

func TestBlockBlankLineAsEnd(t *testing.T) {
	input := "skip\nBEGIN\nbody1\nbody2\n\ntail"
	got := Run(input, Options{
		Mode:     ModeBlock,
		Pattern:  "^BEGIN$",
		UseRegex: true,
	})
	if got.Text != "body1\nbody2" {
		t.Fatalf("Text = %q", got.Text)
	}
}

func TestBlockBadStartRegex(t *testing.T) {
	got := Run("a", Options{Mode: ModeBlock, Pattern: "(", UseRegex: true})
	if got.Error == "" {
		t.Fatalf("expected error for bad start regex")
	}
}

func TestBlockBadEndRegex(t *testing.T) {
	got := Run("a", Options{
		Mode:     ModeBlock,
		Pattern:  "a",
		BlockEnd: "(",
		UseRegex: true,
	})
	if got.Error == "" {
		t.Fatalf("expected error for bad end regex")
	}
}
