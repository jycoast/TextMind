package dedupe

import "testing"

func TestLines(t *testing.T) {
	input := "1\n2\n3\n3"
	want := "1\n2\n3"

	got := Lines(input)
	if got != want {
		t.Fatalf("Lines() = %q, want %q", got, want)
	}
}

func TestLinesAndRemoved(t *testing.T) {
	input := "a\nb\na\nc\nb"
	wantResult := "a\nb\nc"
	wantRemoved := 2

	gotResult, gotRemoved := LinesAndRemoved(input)
	if gotResult != wantResult {
		t.Fatalf("LinesAndRemoved() result = %q, want %q", gotResult, wantResult)
	}
	if gotRemoved != wantRemoved {
		t.Fatalf("LinesAndRemoved() removed = %d, want %d", gotRemoved, wantRemoved)
	}
}

func TestOnlySingletonLines(t *testing.T) {
	t.Run("drops values appearing two or more times", func(t *testing.T) {
		input := "a\nb\na\nc\nb"
		wantResult := "c"
		wantRemoved := 4

		gotResult, gotRemoved := OnlySingletonLines(input)
		if gotResult != wantResult {
			t.Fatalf("OnlySingletonLines() result = %q, want %q", gotResult, wantResult)
		}
		if gotRemoved != wantRemoved {
			t.Fatalf("OnlySingletonLines() removed = %d, want %d", gotRemoved, wantRemoved)
		}
	})

	t.Run("keeps all when each line is unique", func(t *testing.T) {
		input := "1\n2\n3"
		wantResult := "1\n2\n3"
		wantRemoved := 0

		gotResult, gotRemoved := OnlySingletonLines(input)
		if gotResult != wantResult {
			t.Fatalf("OnlySingletonLines() result = %q, want %q", gotResult, wantResult)
		}
		if gotRemoved != wantRemoved {
			t.Fatalf("OnlySingletonLines() removed = %d, want %d", gotRemoved, wantRemoved)
		}
	})

	t.Run("all duplicates yields empty", func(t *testing.T) {
		input := "a\na\na"
		wantResult := ""
		wantRemoved := 3

		gotResult, gotRemoved := OnlySingletonLines(input)
		if gotResult != wantResult {
			t.Fatalf("OnlySingletonLines() result = %q, want %q", gotResult, wantResult)
		}
		if gotRemoved != wantRemoved {
			t.Fatalf("OnlySingletonLines() removed = %d, want %d", gotRemoved, wantRemoved)
		}
	})
}
