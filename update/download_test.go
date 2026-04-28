package update

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestDownloadAssetHappyPath(t *testing.T) {
	payload := bytes.Repeat([]byte("X"), 100_000)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", "100000")
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "asset.bin")

	var lastTotal atomic.Int64
	var lastDone atomic.Int64
	err := DownloadAsset(context.Background(), srv.URL, dest, func(d, total int64) {
		lastDone.Store(d)
		lastTotal.Store(total)
	})
	if err != nil {
		t.Fatalf("DownloadAsset: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Errorf("payload mismatch: got %d bytes, want %d", len(got), len(payload))
	}
	if lastDone.Load() != int64(len(payload)) {
		t.Errorf("final downloaded = %d, want %d", lastDone.Load(), len(payload))
	}
	if lastTotal.Load() != int64(len(payload)) {
		t.Errorf("final total = %d, want %d", lastTotal.Load(), len(payload))
	}
	// .part file must be cleaned up.
	if _, err := os.Stat(dest + ".part"); !os.IsNotExist(err) {
		t.Errorf("temp .part file should not exist: err=%v", err)
	}
}

func TestDownloadAssetHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, "no entry")
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "x.bin")
	err := DownloadAsset(context.Background(), srv.URL, dest, nil)
	if err == nil {
		t.Fatal("expected error for 403, got nil")
	}
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("err = %v", err)
	}
	if _, err := os.Stat(dest); err == nil {
		t.Error("dest should not exist after failed download")
	}
}

func TestDownloadAssetSizeCapHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", "9999999999") // way over cap
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "x.bin")
	err := DownloadAsset(context.Background(), srv.URL, dest, nil)
	if err == nil {
		t.Fatal("expected error for oversized asset")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Errorf("err = %v", err)
	}
}

func TestDownloadAssetCtxCancel(t *testing.T) {
	// Hangs forever until client disconnects.
	hold := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		f, ok := w.(http.Flusher)
		if !ok {
			return
		}
		_, _ = w.Write([]byte("x"))
		f.Flush()
		select {
		case <-hold:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(hold)

	ctx, cancel := context.WithCancel(context.Background())
	dest := filepath.Join(t.TempDir(), "x.bin")

	errCh := make(chan error, 1)
	go func() {
		errCh <- DownloadAsset(ctx, srv.URL, dest, nil)
	}()

	cancel()
	select {
	case err := <-errCh:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("err = %v, want context.Canceled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("download did not return after cancel")
	}
}

func TestDownloadAssetValidation(t *testing.T) {
	if err := DownloadAsset(context.Background(), "", "/tmp/x", nil); err == nil {
		t.Error("expected error for empty url")
	}
	if err := DownloadAsset(context.Background(), "http://x/y", "", nil); err == nil {
		t.Error("expected error for empty dest")
	}
}
