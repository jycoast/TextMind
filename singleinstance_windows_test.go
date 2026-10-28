//go:build windows

package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// TestSingleInstanceForward verifies the full IPC round-trip: the primary
// instance serves a named pipe and receives the paths that a secondary
// instance forwards to it. It is skipped when a real TextMind instance holds
// the single-instance mutex (e.g. the app is open while running tests).
func TestSingleInstanceForward(t *testing.T) {
	si, primary := Acquire()
	if !primary {
		t.Skip("another TextMind instance is running; skipping IPC test")
	}
	defer si.Release()

	got := make(chan []string, 1)
	si.Serve(func(paths []string) {
		select {
		case got <- paths:
		default:
		}
	})

	// Give the accept loop a moment to create the first pipe instance so the
	// client's CreateFile does not race ahead of the server.
	time.Sleep(200 * time.Millisecond)

	want := []string{`C:\a\b.txt`, `D:\dir\c.md`}
	if !Forward(want) {
		t.Fatal("Forward returned false (client could not reach the primary pipe)")
	}

	select {
	case paths := <-got:
		if len(paths) != len(want) || paths[0] != want[0] || paths[1] != want[1] {
			t.Fatalf("got %v, want %v", paths, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for forwarded paths")
	}
}

// TestRaiseWindowNoWindow ensures raiseWindow is a safe no-op when no TextMind
// window is present (e.g. during tests), so it never panics.
func TestRaiseWindowNoWindow(t *testing.T) {
	raiseWindow(nil) // should return immediately (nil ctx guards the calls)
}

// TestSingleInstanceForwardLargePayload exercises the message-mode continuation
// path: a single path longer than the 4096-byte pipe buffer must be reassembled
// from multiple ERROR_MORE_DATA reads.
func TestSingleInstanceForwardLargePayload(t *testing.T) {
	si, primary := Acquire()
	if !primary {
		t.Skip("another TextMind instance is running; skipping IPC test")
	}
	defer si.Release()

	got := make(chan []string, 1)
	si.Serve(func(paths []string) {
		select {
		case got <- paths:
		default:
		}
	})
	time.Sleep(200 * time.Millisecond)

	want := []string{`C:\very\` + strings.Repeat("long", 1500) + `\file.txt`} // > 6KB
	if !Forward(want) {
		t.Fatal("Forward returned false for large payload")
	}

	select {
	case paths := <-got:
		if len(paths) != 1 || paths[0] != want[0] {
			t.Fatalf("got %q, want %q", paths, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for forwarded large payload")
	}
}

// TestParseMessage covers payload parsing and the token-based authentication.
func TestParseMessage(t *testing.T) {
	token := "a1b2c3"
	cases := []struct {
		name  string
		token string
		msg   string
		want  []string
	}{
		{"two paths", token, token + "\nC:\\a.txt\nD:\\b.txt\n", []string{`C:\a.txt`, `D:\b.txt`}},
		{"empty lines skipped", token, token + "\nC:\\a.txt\n\n \nD:\\b.txt\n", []string{`C:\a.txt`, `D:\b.txt`}},
		{"wrong token rejected", token, "wrong\nC:\\a.txt\n", nil},
		{"missing token rejected", token, "C:\\a.txt\n", nil},
		{"blank payload", token, token + "\n", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := parseMessage(c.token, []byte(c.msg))
			if len(got) != len(c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
			for i := range got {
				if got[i] != c.want[i] {
					t.Fatalf("got %v, want %v", got, c.want)
				}
			}
		})
	}
}

// TestForwardNoServer verifies Forward fails gracefully when no primary is
// running: it cannot read the handshake token (Release removed it) and no pipe
// is listening, so it returns false rather than hanging.
func TestForwardNoServer(t *testing.T) {
	si, primary := Acquire()
	if !primary {
		t.Skip("another TextMind instance is running; skipping IPC test")
	}
	si.Release() // tear down without ever serving

	if Forward([]string{`C:\a.txt`}) {
		t.Fatal("Forward unexpectedly succeeded with no server running")
	}
}

// TestForwardHelper is not a real test: it is exec'd by
// TestSingleInstanceCrossProcess as a stand-in for a second TextMind process.
// It calls Forward in a separate OS process so the named-pipe handshake is
// exercised across real process boundaries, not just goroutines.
func TestForwardHelper(t *testing.T) {
	if os.Getenv("TEXTMIND_FORWARD_HELPER") != "1" {
		return
	}
	if !Forward([]string{`C:\x\cross-process.txt`, `D:\y\second.md`}) {
		os.Exit(2)
	}
	os.Exit(0)
}

// TestSingleInstanceCrossProcess runs Forward in a spawned child process to
// verify the named pipe works across real process boundaries.
func TestSingleInstanceCrossProcess(t *testing.T) {
	si, primary := Acquire()
	if !primary {
		t.Skip("another TextMind instance is running; skipping IPC test")
	}
	defer si.Release()

	got := make(chan []string, 1)
	si.Serve(func(paths []string) {
		select {
		case got <- paths:
		default:
		}
	})
	time.Sleep(200 * time.Millisecond)

	cmd := exec.Command(os.Args[0], "-test.run", "^TestForwardHelper$")
	cmd.Env = append(os.Environ(), "TEXTMIND_FORWARD_HELPER=1")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("child Forward failed: %v\n%s", err, out)
	}

	select {
	case paths := <-got:
		want := []string{`C:\x\cross-process.txt`, `D:\y\second.md`}
		if len(paths) != len(want) || paths[0] != want[0] || paths[1] != want[1] {
			t.Fatalf("got %v, want %v", paths, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for cross-process forwarded paths")
	}
}
