//go:build windows

package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// instanceID is a fixed suffix that keeps the mutex, pipe and token file
// unique to this application across different installs of TextMind.
const instanceID = "5f3a9c2e-7d1b-4e6a-9c8f-3b2a1d0e9c77"

// mutexName is per-session (Local\ namespace), so each interactive session
// decides single-instance independently.
const mutexName = `Local\TextMind-SingleInstance-` + instanceID

// pipeName is derived at startup and includes the session ID so it matches the
// session-scoped mutex: a pipe is machine-global, so two sessions must not
// fight over the same name. Within one session the name is stable across
// processes, which is what the forwarding handshake relies on.
var pipeName = func() string {
	var sid uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &sid); err == nil {
		return `\\.\pipe\TextMind-SingleInstance-` + instanceID + "-s" + strconv.FormatUint(uint64(sid), 10)
	}
	return `\\.\pipe\TextMind-SingleInstance-` + instanceID
}()

// pipeMode uses message mode so that a single WriteFile from the client is
// delivered as one atomic message the server can read in a single ReadFile,
// and so the write-then-close race cannot lose buffered data.
const pipeMode = uint32(windows.PIPE_TYPE_MESSAGE) | windows.PIPE_READMODE_MESSAGE | windows.PIPE_WAIT

// pipeBuffer sizes the pipe's in/out buffers. In message mode a write that
// exceeds the buffer is truncated, so it must comfortably exceed the largest
// legitimate payload: a forwarded file list. Windows paths are capped at
// 32,767 chars each, so 64KB leaves ample room for even a worst-case batch.
const pipeBuffer = 64 * 1024

// errCancelled is returned when the accept loop is interrupted by Release.
var errCancelled = errors.New("single-instance accept cancelled")

// tokenFilePath returns the location where the primary instance stores the
// random handshake token that secondaries must present to forward files.
// A file (rather than a hardcoded constant) means the token changes on every
// run, so an unrelated local process cannot guess it from the binary.
func tokenFilePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "TextMind-single-instance.token")
	}
	return filepath.Join(dir, "TextMind", "single-instance.token")
}

func newToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return instanceID // ultra-fallback; keeps forwarding functional if rand fails
	}
	return hex.EncodeToString(b)
}

// SingleInstance enforces that only one TextMind window runs at a time per
// session and lets later invocations (e.g. double-clicking a file while the
// app is open) hand their file paths to the already-running instance.
//
// A named mutex decides whether this process is the primary instance. The
// primary then serves a named pipe; secondary processes write a token plus
// their launch paths to that pipe and exit without creating a window. The
// server-side pipe is opened with FILE_FLAG_OVERLAPPED so a blocking
// ConnectNamedPipe can be cancelled from Release. A token handshake plus an
// acknowledgment guarantee both authenticity and that the payload is
// delivered before the client closes.
type SingleInstance struct {
	mu    windows.Handle // owned only by the primary instance
	token string         // random per-run handshake token
	done  chan struct{}  // closed by Release to stop the accept loop
	wg    sync.WaitGroup // tracks the accept goroutine
	once  sync.Once      // guards Release so it runs exactly once
}

// Acquire checks whether another TextMind instance is already running in this
// session.
//
// Returns (nil, false) when a primary instance exists — the caller should
// forward its launch paths via Forward and exit. Otherwise returns a
// *SingleInstance (the primary) and true, having written the handshake token.
// If the mutex cannot be created for an unexpected reason, we optimistically
// treat this process as the primary so the app can still start.
func Acquire() (*SingleInstance, bool) {
	name := windows.StringToUTF16Ptr(mutexName)
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		// Another instance holds the mutex. Closing our duplicate handle is
		// safe and tidy: the object stays alive because the primary keeps its
		// own handle open.
		if h != 0 {
			windows.CloseHandle(h)
		}
		return nil, false
	}
	si := &SingleInstance{token: newToken()}
	if err == nil {
		si.mu = h
	}
	si.writeToken()
	return si, true
}

func (s *SingleInstance) writeToken() {
	if s.token == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(tokenFilePath()), 0o700); err != nil {
		return
	}
	_ = os.WriteFile(tokenFilePath(), []byte(s.token), 0o600)
}

func readToken() (string, error) {
	b, err := os.ReadFile(tokenFilePath())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

// Forward is called by a secondary process to hand its launch paths to the
// running primary. It reads the handshake token, then writes the token plus
// the newline-separated paths as a single message, waits for the server's
// acknowledgment, and returns whether the hand-off succeeded. A false return
// is non-fatal: the secondary simply exits and the file is not opened.
//
// It retries briefly because the primary may still be writing its token file
// and creating the first pipe instance right after it starts.
func Forward(paths []string) bool {
	if len(paths) == 0 {
		return false
	}
	payload := []byte(strings.Join(paths, "\n"))
	for attempt := 0; attempt < 40; attempt++ {
		token, err := readToken()
		if err != nil {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		if tryForward(token, payload) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func tryForward(token string, payload []byte) bool {
	message := append([]byte(token), '\n')
	message = append(message, payload...)
	message = append(message, '\n')

	pipe, err := windows.CreateFile(
		windows.StringToUTF16Ptr(pipeName),
		windows.GENERIC_WRITE|windows.GENERIC_READ,
		0, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL, 0,
	)
	if err != nil {
		return false
	}
	defer windows.CloseHandle(pipe)

	var written uint32
	if err := windows.WriteFile(pipe, message, &written, nil); err != nil {
		return false
	}
	// Wait for the server to acknowledge it read the payload before closing,
	// so the message is not lost in the write-then-close race.
	var n uint32
	ack := make([]byte, 1)
	if err := windows.ReadFile(pipe, ack, &n, nil); err != nil {
		return false
	}
	return true
}

// Serve starts the primary's background accept loop. Each time a secondary
// instance connects and sends a valid payload, onPaths is invoked with the
// paths. It is safe to call once; the loop stops when Release is called.
func (s *SingleInstance) Serve(onPaths func([]string)) {
	if onPaths == nil || s.done != nil {
		return
	}
	s.done = make(chan struct{})
	s.wg.Add(1)
	go s.acceptLoop(onPaths)
}

func (s *SingleInstance) acceptLoop(onPaths func([]string)) {
	defer s.wg.Done()
	for {
		select {
		case <-s.done:
			return
		default:
		}
		pipe, err := s.acceptOnce()
		if err != nil {
			select {
			case <-s.done:
				return
			case <-time.After(50 * time.Millisecond):
			}
			continue
		}
		s.serveClient(pipe, onPaths)
		windows.CloseHandle(pipe)
	}
}

// acceptOnce creates one named-pipe instance and blocks until a client
// connects. It is cancellable: when Release closes s.done, the pending
// ConnectNamedPipe is cancelled via CancelIoEx and acceptOnce returns
// errCancelled. On success the connected (still-overlapped) handle is
// returned; on failure the handle is already closed and 0 is returned.
func (s *SingleInstance) acceptOnce() (windows.Handle, error) {
	h, err := windows.CreateNamedPipe(
		windows.StringToUTF16Ptr(pipeName),
		windows.PIPE_ACCESS_DUPLEX|windows.FILE_FLAG_OVERLAPPED,
		pipeMode,
		1, pipeBuffer, pipeBuffer, 0, nil,
	)
	if err != nil {
		return 0, err
	}

	ev, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		windows.CloseHandle(h)
		return 0, err
	}
	defer windows.CloseHandle(ev)

	ol := &windows.Overlapped{HEvent: ev}
	cerr := windows.ConnectNamedPipe(h, ol)
	if cerr == windows.ERROR_PIPE_CONNECTED {
		return h, nil // a client connected before we started waiting
	}
	if cerr != windows.ERROR_IO_PENDING {
		windows.CloseHandle(h)
		return 0, cerr
	}

	// Wait for the connect to complete, polling so we notice s.done closing.
	for {
		select {
		case <-s.done:
			windows.CancelIoEx(h, ol)
			windows.WaitForSingleObject(ev, windows.INFINITE)
			windows.CloseHandle(h)
			return 0, errCancelled
		default:
		}
		r, _ := windows.WaitForSingleObject(ev, 50)
		if r == windows.WAIT_OBJECT_0 {
			var n uint32
			if err := windows.GetOverlappedResult(h, ol, &n, false); err != nil {
				windows.CloseHandle(h)
				return 0, err
			}
			return h, nil
		}
	}
}

// serveClient reads the single message a secondary process wrote, verifies the
// handshake token, acknowledges so the client can safely close, and invokes
// onPaths with the payload paths. The handle is overlapped, so reads and the
// ack write must complete via GetOverlappedResult. In message mode one
// ReadFile returns the whole message unless it exceeds the buffer, in which
// case ERROR_MORE_DATA triggers continuation reads.
func (s *SingleInstance) serveClient(pipe windows.Handle, onPaths func([]string)) {
	var buf []byte
	// Read with a buffer as large as the pipe buffer. In message mode a message
	// no larger than the buffer is delivered in a single read, so the common
	// case is one atomic ReadFile. The ERROR_MORE_DATA continuation below is a
	// safety net for messages that somehow exceed the buffer.
	tmp := make([]byte, pipeBuffer)
	for {
		n, err := overlappedRead(pipe, tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err == windows.ERROR_MORE_DATA {
			continue // message larger than the buffer; keep reading
		}
		break // full message received (err == nil) or connection closed
	}

	// Acknowledge receipt so the client can close its handle without losing data.
	overlappedWrite(pipe, []byte{1})

	if paths := parseMessage(s.token, buf); len(paths) > 0 {
		onPaths(paths)
	}
}

// parseMessage splits the payload into paths, requiring the first line to match
// the expected handshake token. A mismatch or missing token yields nil.
func parseMessage(token string, buf []byte) []string {
	lines := strings.Split(strings.TrimSpace(string(buf)), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != token {
		return nil
	}
	var paths []string
	for _, line := range lines[1:] {
		if line = strings.TrimSpace(line); line != "" {
			paths = append(paths, line)
		}
	}
	return paths
}

// overlappedRead performs a blocking read on an overlapped handle, returning
// the number of bytes read and the final error (including ERROR_MORE_DATA for
// a message larger than the buffer).
func overlappedRead(h windows.Handle, buf []byte) (uint32, error) {
	var n uint32
	ol := &windows.Overlapped{}
	err := windows.ReadFile(h, buf, &n, ol)
	if err == windows.ERROR_IO_PENDING {
		err = windows.GetOverlappedResult(h, ol, &n, true)
	}
	return n, err
}

// overlappedWrite performs a blocking write on an overlapped handle.
func overlappedWrite(h windows.Handle, buf []byte) error {
	var n uint32
	ol := &windows.Overlapped{}
	err := windows.WriteFile(h, buf, &n, ol)
	if err == windows.ERROR_IO_PENDING {
		err = windows.GetOverlappedResult(h, ol, &n, true)
	}
	return err
}

// Release stops the accept loop, removes the handshake token and closes the
// primary's mutex handle. Safe to call from shutdown. Closing s.done makes the
// pending ConnectNamedPipe return via CancelIoEx, so the accept goroutine
// exits promptly. A sync.Once makes it safe to call more than once and to call
// even when Serve was never started.
func (s *SingleInstance) Release() {
	s.once.Do(func() {
		if s.done != nil {
			close(s.done)
			s.wg.Wait()
		}
		if s.token != "" {
			_ = os.Remove(tokenFilePath())
			s.token = ""
		}
		if s.mu != 0 {
			windows.CloseHandle(s.mu)
			s.mu = 0
		}
	})
}
