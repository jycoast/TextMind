package persist

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const (
	logFileName    = "textmind.log"
	logMaxBytes    = 5 * 1024 * 1024 // 5 MB
	logOldFileName = "textmind.log.old"
)

// LogFilePath returns the path to the application log file.
func LogFilePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "TextMind", logFileName), nil
}

// OpenLogFile opens (or creates) the log file for appending. If the file
// exceeds logMaxBytes it is rotated: the current log becomes .old and a
// fresh file is opened. The caller owns the returned file and should defer
// Close.
//
// Returns (nil, nil) when the log path cannot be determined — the caller
// should fall back to stderr or discard.
func OpenLogFile() (*os.File, error) {
	path, err := LogFilePath()
	if err != nil {
		return nil, nil
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	rotateIfNeeded(path)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}

	// Write a startup separator so different sessions are visually distinct.
	fmt.Fprintf(f, "\n--- TextMind started at %s ---\n", time.Now().Format(time.DateTime))
	return f, nil
}

// NewLogWriter returns an io.Writer suitable for log.New(). It writes to
// the log file when available, otherwise falls back to os.Stderr.
func NewLogWriter() io.Writer {
	f, err := OpenLogFile()
	if err != nil || f == nil {
		return os.Stderr
	}
	return f
}

func rotateIfNeeded(path string) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < logMaxBytes {
		return
	}
	old := filepath.Join(filepath.Dir(path), logOldFileName)
	_ = os.Remove(old)
	_ = os.Rename(path, old)
}
