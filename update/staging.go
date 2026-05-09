package update

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// fallbackStagingSubdir is the folder name we create under %TEMP% when the
// install directory is not writable. Kept stable so leftover files from a
// previous failed run can be reused/cleaned predictably.
const fallbackStagingSubdir = "TextMind-update"

// ResolveStagingDir picks where to stage the downloaded update asset.
//
// We prefer the directory that contains the currently running executable:
// staging next to the running .exe makes the helper's eventual move a
// same-volume rename (cheap, atomic) and means the user can see the new
// binary appear in the same folder they launched the app from.
//
// When that directory is not writable — typically because the app is
// installed under C:\Program Files\ and was launched without elevation —
// we fall back to %TEMP%/TextMind-update so a non-admin user can still
// auto-update. The helper script then performs the cross-volume move,
// which is the same code path the previous (TEMP-only) implementation
// used, so behaviour in that case is unchanged.
//
// Returns:
//   - dir: the chosen staging directory, guaranteed to exist on success.
//   - fellBack: true when we couldn't use the install dir and dropped to
//     %TEMP%. Surfaced to the UI so it can explain "你的安装目录无写权限".
//   - err: only non-nil if BOTH the install dir probe and the %TEMP%
//     fallback fail to mkdir. In practice this only happens on a broken
//     filesystem.
func ResolveStagingDir(currentExe string) (dir string, fellBack bool, err error) {
	currentExe = strings.TrimSpace(currentExe)
	if currentExe != "" {
		installDir := filepath.Dir(currentExe)
		if installDir != "" && installDir != "." {
			if probeWritable(installDir) == nil {
				return installDir, false, nil
			}
		}
	}

	fallback := filepath.Join(os.TempDir(), fallbackStagingSubdir)
	if mkErr := os.MkdirAll(fallback, 0o755); mkErr != nil {
		return "", true, mkErr
	}
	return fallback, true, nil
}

// probeWritable returns nil if dir is currently writable by this process.
//
// We don't trust filesystem permission bits alone — on Windows ACLs and
// elevation status can produce surprising results — so we do the only
// truly reliable check: try to create a small file. The probe file is
// hidden by name (leading dot) and removed immediately whether the test
// succeeds or fails.
func probeWritable(dir string) error {
	if dir == "" {
		return errors.New("update: empty dir")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".tm-probe-*")
	if err != nil {
		return err
	}
	name := f.Name()
	_ = f.Close()
	_ = os.Remove(name)
	return nil
}
