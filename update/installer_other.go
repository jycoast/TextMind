//go:build !windows

package update

import (
	"os"
	"path/filepath"
)

// Apply on non-Windows is intentionally unimplemented; users on macOS /
// Linux currently install via package managers or unzip the artifact
// themselves. The frontend should hide the "立即更新" button when this
// returns ErrUnsupported and only offer "前往下载页".
func Apply(newExePath, currentExePath string) error {
	return ErrUnsupported
}

// CurrentExecutable returns the absolute path of the running binary.
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
