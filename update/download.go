package update

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// MaxAssetSize caps single-asset downloads at 200 MiB to bound memory /
// disk usage if the server reports something absurd.
const MaxAssetSize = 200 * 1024 * 1024

// ProgressFn reports cumulative bytes downloaded and the expected total
// (0 when unknown). Called from the goroutine doing the copy; callers must
// be threadsafe.
type ProgressFn func(downloaded, total int64)

// DownloadAsset fetches `url` and writes the body atomically to `destPath`.
//
// Atomicity: the body is first written to `<destPath>.part`; on success it
// is renamed into place. A failed or cancelled download leaves the .part
// file behind, which the caller may delete or resume.
//
// Behaviour notes:
//
//   - The Content-Length header populates progress's `total` value when
//     present; chunked responses report `total = 0`.
//   - The download is hard-capped at MaxAssetSize bytes regardless of what
//     the server claims, defending against runaway responses.
//   - If `url` redirects through a 3xx, http.Client follows it; the final
//     status must be 2xx.
func DownloadAsset(ctx context.Context, url, destPath string, progress ProgressFn) error {
	url = trim(url)
	destPath = trim(destPath)
	if url == "" {
		return errors.New("update: download url is empty")
	}
	if destPath == "" {
		return errors.New("update: destination path is empty")
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("update: prepare dest dir: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("update: build download request: %w", err)
	}
	req.Header.Set("Accept", "application/octet-stream")
	req.Header.Set("User-Agent", "TextMind-Updater/1.0")

	hc := &http.Client{Timeout: 0} // streamed; ctx drives cancellation
	resp, err := hc.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("update: GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		return fmt.Errorf("update: download http %d: %s", resp.StatusCode, trim(string(body)))
	}

	total := resp.ContentLength
	if total > MaxAssetSize {
		return fmt.Errorf("update: asset too large: %d bytes (max %d)", total, MaxAssetSize)
	}

	tmp := destPath + ".part"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("update: open tmp file: %w", err)
	}
	closed := false
	defer func() {
		if !closed {
			_ = out.Close()
		}
	}()

	cw := &countingWriter{w: out, total: total, fn: progress, last: time.Now()}
	if _, err := io.Copy(cw, io.LimitReader(resp.Body, MaxAssetSize+1)); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("update: write asset: %w", err)
	}
	if cw.n > MaxAssetSize {
		return fmt.Errorf("update: asset exceeded %d-byte cap", MaxAssetSize)
	}
	if err := out.Sync(); err != nil {
		return fmt.Errorf("update: sync tmp file: %w", err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("update: close tmp file: %w", err)
	}
	closed = true

	// Last progress tick to ensure the UI sees 100%.
	if progress != nil {
		progress(cw.n, total)
	}

	if err := os.Rename(tmp, destPath); err != nil {
		// Windows sometimes refuses Rename across volumes / when target
		// exists; fall back to remove + rename.
		_ = os.Remove(destPath)
		if err2 := os.Rename(tmp, destPath); err2 != nil {
			return fmt.Errorf("update: rename %s -> %s: %w", tmp, destPath, err2)
		}
	}
	return nil
}

func trim(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t' || s[0] == '\n' || s[0] == '\r') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t' || s[len(s)-1] == '\n' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}

// countingWriter is io.Writer that emits progress callbacks throttled to
// once every ~100ms so we don't flood the frontend.
type countingWriter struct {
	w     io.Writer
	n     int64
	total int64
	fn    ProgressFn
	last  time.Time
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.w.Write(p)
	c.n += int64(n)
	if c.fn != nil {
		now := time.Now()
		if now.Sub(c.last) >= 100*time.Millisecond {
			c.last = now
			c.fn(c.n, c.total)
		}
	}
	return n, err
}
