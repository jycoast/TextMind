//go:build windows

package update

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

// Apply swaps the running executable with `newExePath` and relaunches it.
//
// Mechanism:
//  1. We can't overwrite the running .exe directly on Windows (sharing
//     violation). Instead we write a tiny .bat helper to %TEMP%.
//  2. The helper waits a couple of seconds for the parent process to exit,
//     then moves the new .exe over the old one, deletes the staging file,
//     starts the freshly-installed app, and self-deletes.
//  3. We launch the helper detached with CREATE_NEW_PROCESS_GROUP so it
//     survives our exit, then the caller os.Exit(0)'s the app.
//
// The helper retries up to ~15 seconds with 500ms backoff in case the
// shutting-down app holds the file briefly. If it can't replace the file
// it logs to %TEMP%\TextMind-update.log and leaves the original alone.
func Apply(newExePath, currentExePath string) error {
	newExePath = trim(newExePath)
	currentExePath = trim(currentExePath)
	if newExePath == "" {
		return errors.New("update: new exe path is empty")
	}
	if currentExePath == "" {
		return errors.New("update: current exe path is empty")
	}
	if _, err := os.Stat(newExePath); err != nil {
		return fmt.Errorf("update: staged exe missing: %w", err)
	}
	if _, err := os.Stat(currentExePath); err != nil {
		return fmt.Errorf("update: target exe missing: %w", err)
	}

	tmpDir := os.TempDir()
	helperPath := filepath.Join(tmpDir, fmt.Sprintf("TextMind-update-%d.bat", time.Now().UnixNano()))
	logPath := filepath.Join(tmpDir, "TextMind-update.log")

	script := buildHelperScript(newExePath, currentExePath, logPath)
	if err := os.WriteFile(helperPath, []byte(script), 0o755); err != nil {
		return fmt.Errorf("update: write helper: %w", err)
	}

	// Launch the helper detached so it outlives us. cmd.exe runs the .bat;
	// /c exits when the script ends. The CREATE_NEW_PROCESS_GROUP +
	// DETACHED_PROCESS combo prevents inheriting our console.
	cmd := exec.Command("cmd.exe", "/c", "start", "", "/min", helperPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x00000200 | 0x00000008, // CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS
	}
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("update: spawn helper: %w", err)
	}
	// Don't Wait(): the helper is detached on purpose.
	return nil
}

// buildHelperScript returns a self-contained .bat that:
//   - sleeps a beat so the parent can fully release the .exe lock
//   - retries the move up to 30 times (15s) at 500ms intervals
//   - launches the new app on success, logs and bails on failure
//   - self-deletes
func buildHelperScript(stagedExe, targetExe, logPath string) string {
	return "" +
		"@echo off\r\n" +
		"setlocal\r\n" +
		"set \"STAGED=" + stagedExe + "\"\r\n" +
		"set \"TARGET=" + targetExe + "\"\r\n" +
		"set \"LOG=" + logPath + "\"\r\n" +
		"echo [%date% %time%] update helper start >> \"%LOG%\" 2>&1\r\n" +
		"timeout /t 2 /nobreak >nul\r\n" +
		"set /a TRIES=0\r\n" +
		":retry\r\n" +
		"set /a TRIES+=1\r\n" +
		"move /y \"%STAGED%\" \"%TARGET%\" >> \"%LOG%\" 2>&1\r\n" +
		"if not errorlevel 1 goto launch\r\n" +
		"if %TRIES% geq 30 goto fail\r\n" +
		"timeout /t 1 /nobreak >nul\r\n" +
		"goto retry\r\n" +
		":launch\r\n" +
		"echo [%date% %time%] update helper success >> \"%LOG%\" 2>&1\r\n" +
		"start \"\" \"%TARGET%\"\r\n" +
		"goto done\r\n" +
		":fail\r\n" +
		"echo [%date% %time%] update helper failed after %TRIES% attempts >> \"%LOG%\" 2>&1\r\n" +
		":done\r\n" +
		"(goto) 2>nul & del \"%~f0\"\r\n"
}

// CurrentExecutable returns the absolute path of the running .exe.
func CurrentExecutable() (string, error) {
	p, err := os.Executable()
	if err != nil {
		return "", err
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return p, nil
	}
	return abs, nil
}
