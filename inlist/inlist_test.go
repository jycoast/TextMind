package inlist

import "testing"

func TestQuotedCommaLines(t *testing.T) {
	got, n := QuotedCommaLines("1\n2")
	want := `'1','2'`
	if n != 2 {
		t.Fatalf("count = %d, want 2", n)
	}
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestQuotedCommaLines_escapesQuotes(t *testing.T) {
	got, n := QuotedCommaLines("a'b")
	if n != 1 {
		t.Fatalf("count = %d, want 1", n)
	}
	want := `'a''b'`
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestQuotedCommaLines_empty(t *testing.T) {
	got, n := QuotedCommaLines("")
	if n != 0 {
		t.Fatalf("count = %d, want 0", n)
	}
	if got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestQuotedCommaLines_whitespace(t *testing.T) {
	got, n := QuotedCommaLines("  hello  \n\n  world  \n")
	want := `'hello','world'`
	if n != 2 {
		t.Fatalf("count = %d, want 2", n)
	}
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
