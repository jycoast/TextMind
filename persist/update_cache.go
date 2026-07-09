package persist

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"TextMind/update"
)

// UpdateCache is the on-disk twin of the in-memory release cache used by the
// updater. Persisting it lets the ETag survive app restarts, which is the
// only thing that keeps the 60-req/h anonymous GitHub limit from biting:
// once we've fetched a release the very first time, every subsequent check
// becomes a conditional `If-None-Match` request that GitHub answers with
// 304 Not Modified — and 304s do NOT count against the rate limit.
//
// Without persistence, a few normal launches in a day (especially during dev
// hot-reloads, or after every `wails dev` restart) burn fresh quota each
// time, even though the release contents haven't actually changed.
//
// Schema is versioned defensively: if a future release adds fields we'll
// just bump SchemaVersion and ignore unknown old files at load time.
type UpdateCache struct {
	SchemaVersion int             `json:"schemaVersion"`
	ETag          string          `json:"etag,omitempty"`
	FetchedAt     time.Time       `json:"fetchedAt,omitempty"`
	Release       *update.Release `json:"release,omitempty"`
}

const updateCacheSchemaVersion = 1

// UpdateCachePath returns the on-disk path for the update cache file. Lives
// alongside session.json / ai-config.json so all user state stays under one
// tree.
func UpdateCachePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "TextMind", "update-cache.json"), nil
}

// LoadUpdateCache reads the cache from path. Missing / unreadable / wrong-
// schema files produce a zero-value cache with a nil error so first-run users
// (and users coming from an older app version) just fall through to a normal
// network fetch on the next CheckForUpdate.
func LoadUpdateCache(path string) (UpdateCache, error) {
	if path == "" {
		return UpdateCache{}, errors.New("persist: empty update cache path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return UpdateCache{}, nil
		}
		return UpdateCache{}, err
	}
	var cache UpdateCache
	if err := json.Unmarshal(data, &cache); err != nil {
		// Corrupt file — treat as empty rather than refusing to start.
		return UpdateCache{}, nil
	}
	if cache.SchemaVersion != updateCacheSchemaVersion {
		return UpdateCache{}, nil
	}
	return cache, nil
}

// SaveUpdateCache writes the cache atomically. We deliberately tolerate any
// I/O error at the call site (logging only): persisting the cache is a
// performance / rate-limit optimisation, not a correctness requirement.
func SaveUpdateCache(path string, cache UpdateCache) error {
	if path == "" {
		return errors.New("persist: empty update cache path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	cache.SchemaVersion = updateCacheSchemaVersion
	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
