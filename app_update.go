package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"TextMind/persist"
	"TextMind/update"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// updateRepo points the in-app updater at the project's GitHub repository.
//
// This is intentionally hard-coded: shipping it via configuration would let a
// poisoned config file redirect a user's auto-update to a third-party binary,
// which is exactly the attack vector self-update flows have to defend against.
const updateRepo = "jycoast/TextMind"

// updateCheckTTL is the minimum interval between live GitHub API hits.
// Repeated CheckForUpdate calls inside this window return the cached
// result (in-memory or persisted) so users mashing "重新检查" don't burn
// the anonymous 60-req/h rate limit. Beyond the TTL we still send a
// conditional (If-None-Match) request that GitHub answers with a free 304
// when the release hasn't changed, so this value is just a "don't even
// talk to the network" guard, not the only rate-limit defense.
//
// One hour matches the rate-limit window itself: even if the user clicks
// "重新检查" every minute, we'll touch GitHub at most ~1 time per hour
// (plus free 304s) until a new release ships.
const updateCheckTTL = 1 * time.Hour

// UpdateAssetDTO mirrors update.Asset for the frontend.
type UpdateAssetDTO struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Size int64  `json:"size"`
}

// UpdateInfoDTO is returned by CheckForUpdate.
//
// The frontend uses HasUpdate to decide whether to surface the "立即更新"
// CTA. CanAutoInstall is false on platforms where the in-app installer
// cannot run (currently anything but Windows); the UI then falls back to
// the "前往下载页" button which simply opens ReleasePageURL.
type UpdateInfoDTO struct {
	OK             bool            `json:"ok"`
	Error          string          `json:"error,omitempty"`
	CurrentVersion string          `json:"currentVersion"`
	LatestVersion  string          `json:"latestVersion,omitempty"`
	HasUpdate      bool            `json:"hasUpdate"`
	ReleaseName    string          `json:"releaseName,omitempty"`
	ReleaseNotes   string          `json:"releaseNotes,omitempty"`
	ReleaseURL     string          `json:"releaseUrl,omitempty"`
	PublishedAt    string          `json:"publishedAt,omitempty"`
	Asset          *UpdateAssetDTO `json:"asset,omitempty"`
	CanAutoInstall bool            `json:"canAutoInstall"`
	Platform       string          `json:"platform"`
}

// InstallUpdateRequest carries the asset the frontend chose to install.
//
// We accept the URL/name here rather than re-fetching the release inside the
// install call, because the frontend has already shown the user a confirmation
// screen with the exact filename they're about to download.
type InstallUpdateRequest struct {
	AssetURL  string `json:"assetUrl"`
	AssetName string `json:"assetName"`
}

const updateProgressEvent = "update:progress"

// updateState protects the single in-flight install. We disallow parallel
// downloads so the user can't accidentally trigger two concurrent overwrites
// of the same exe.
var (
	updateMu      sync.Mutex
	updateRunning bool
	updateCancel  context.CancelFunc
)

// releaseCache holds the most recent successful CheckForUpdate result so
// we can serve repeat checks without hitting GitHub. The ETag is stashed
// separately so even after the TTL we can issue a conditional request that
// returns 304 (and doesn't count against rate limit) when nothing changed.
//
// The cache is mirrored to disk via persist.UpdateCache so the ETag — the
// only thing that lets us avoid burning fresh rate-limit quota on every
// app restart — survives across launches. Without persistence, normal
// usage patterns (multiple launches per day, `wails dev` hot-reloads)
// trivially exhaust the 60-req/h anonymous limit.
type releaseCache struct {
	mu        sync.Mutex
	release   *update.Release
	etag      string
	fetchedAt time.Time
	// loaded becomes true after the first attempt to hydrate from disk,
	// regardless of whether the file existed. Subsequent CheckForUpdate
	// calls then skip the disk hit and stay in-memory.
	loaded   bool
	diskPath string // empty until loadOnce determines it (and on failure)
}

var updateCache releaseCache

func (c *releaseCache) get() (*update.Release, string, time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.release, c.etag, c.fetchedAt
}

func (c *releaseCache) set(rel *update.Release, etag string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if rel != nil {
		c.release = rel
	}
	if strings.TrimSpace(etag) != "" {
		c.etag = etag
	}
	c.fetchedAt = time.Now()
}

// snapshot returns a copy of the cache fields suitable for persistence.
// Returns a non-nil cache only when we have at least an ETag worth saving
// (an empty file would be useless and just create noise on disk).
func (c *releaseCache) snapshot() (persist.UpdateCache, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.etag == "" && c.release == nil {
		return persist.UpdateCache{}, false
	}
	return persist.UpdateCache{
		ETag:      c.etag,
		FetchedAt: c.fetchedAt,
		Release:   c.release,
	}, true
}

// loadOnce hydrates the in-memory cache from disk on the first call only.
// Subsequent calls are cheap no-ops. We intentionally don't fail loudly on
// I/O errors: a broken / missing cache file just degrades to "pay one API
// call for the very next check", which is the original behaviour anyway.
func (c *releaseCache) loadOnce(logger logf) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.loaded {
		return
	}
	c.loaded = true

	path, err := persist.UpdateCachePath()
	if err != nil {
		logger.Printf("update: resolve cache path failed: %v", err)
		return
	}
	c.diskPath = path

	cached, err := persist.LoadUpdateCache(path)
	if err != nil {
		logger.Printf("update: load cache failed: %v", err)
		return
	}
	if cached.Release != nil {
		c.release = cached.Release
	}
	if cached.ETag != "" {
		c.etag = cached.ETag
	}
	if !cached.FetchedAt.IsZero() {
		c.fetchedAt = cached.FetchedAt
	}
}

// flush writes the current cache state to disk. Called from CheckForUpdate
// after both successful fetches and 304s; we don't bother flushing on the
// rate-limited / stale-cache path because nothing changed.
func (c *releaseCache) flush(logger logf) {
	snap, ok := c.snapshot()
	if !ok {
		return
	}
	c.mu.Lock()
	path := c.diskPath
	c.mu.Unlock()
	if path == "" {
		return
	}
	if err := persist.SaveUpdateCache(path, snap); err != nil {
		logger.Printf("update: save cache failed: %v", err)
	}
}

// logf is the small slice of *log.Logger we actually need; declared as an
// interface so we don't import "log" just for the type.
type logf interface {
	Printf(format string, args ...any)
}

// GetAppVersion returns the build-time injected version string. Defaults to
// "dev" for local development builds so the frontend can render an
// "开发版本" badge.
func (a *App) GetAppVersion() string {
	if v := strings.TrimSpace(a.version); v != "" {
		return v
	}
	return "dev"
}

// CheckForUpdate queries the GitHub Releases API for the latest stable
// release of the project, picks the asset matching the running platform,
// and reports whether an update is available.
//
// To stay friendly with GitHub's anonymous 60-req/h limit we use two
// strategies:
//
//  1. In-memory TTL cache (updateCheckTTL): repeat checks within the window
//     skip the network entirely.
//  2. Conditional requests with ETag: after the TTL we still re-check, but
//     a 304 response doesn't count against rate limit and lets us reuse
//     the cached payload.
//
// All errors are returned in the OK/Error fields rather than as a Go error,
// because this method is wails-bound; the frontend uses these to render
// user-friendly status text.
func (a *App) CheckForUpdate() UpdateInfoDTO {
	current := a.GetAppVersion()
	info := UpdateInfoDTO{
		CurrentVersion: current,
		Platform:       runtime.GOOS + "/" + runtime.GOARCH,
	}

	// Pull whatever the previous launch left on disk (etag + release).
	// First call pays a single tiny file read; subsequent calls are no-ops.
	updateCache.loadOnce(a.logger)

	cachedRel, cachedETag, cachedAt := updateCache.get()

	// Fast path: served entirely from cache, no network call.
	if cachedRel != nil && time.Since(cachedAt) < updateCheckTTL {
		a.fillInfoFromRelease(&info, cachedRel, current)
		a.logger.Printf("update: cache hit (age=%s) latest=%s",
			time.Since(cachedAt).Round(time.Second), cachedRel.TagName)
		return info
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	client := update.NewClient()
	res, err := client.LatestReleaseEx(ctx, updateRepo, update.LatestReleaseOptions{
		IfNoneMatch: cachedETag,
	})

	switch {
	case errors.Is(err, update.ErrNotModified) && cachedRel != nil:
		// Refresh the fetchedAt so the TTL gate doesn't immediately expire
		// the cache again on the next click.
		updateCache.set(nil, res.ETag)
		updateCache.flush(a.logger)
		a.fillInfoFromRelease(&info, cachedRel, current)
		a.logger.Printf("update: 304 not modified, reusing cached %s", cachedRel.TagName)
		return info

	case errors.Is(err, update.ErrRateLimited) && cachedRel != nil:
		// Rate-limited but we still have a stale-yet-valid cache: serve it
		// rather than hard-failing. We do annotate the info so the UI can
		// surface "上次检查时间" if it wants to.
		a.fillInfoFromRelease(&info, cachedRel, current)
		a.logger.Printf("update: rate limited; serving cached release %s", cachedRel.TagName)
		return info

	case err != nil:
		info.Error = err.Error()
		a.logger.Printf("update: check failed: %v", err)
		return info
	}

	rel := res.Release
	updateCache.set(&rel, res.ETag)
	updateCache.flush(a.logger)
	a.fillInfoFromRelease(&info, &rel, current)
	a.logger.Printf("update: check ok current=%s latest=%s hasUpdate=%v auto=%v",
		current, rel.TagName, info.HasUpdate, info.CanAutoInstall)
	return info
}

// fillInfoFromRelease populates the wire DTO from an update.Release. It is
// shared by the live, 304-cached, and rate-limited-cached code paths.
func (a *App) fillInfoFromRelease(info *UpdateInfoDTO, rel *update.Release, current string) {
	info.OK = true
	info.LatestVersion = rel.TagName
	info.ReleaseName = rel.Name
	info.ReleaseNotes = rel.Body
	info.ReleaseURL = rel.HTMLURL
	info.PublishedAt = rel.PublishedAt
	info.HasUpdate = update.IsNewer(current, rel.TagName)

	if asset, ok := update.PickAssetForCurrentPlatform(rel.Assets); ok {
		info.Asset = &UpdateAssetDTO{
			Name: asset.Name,
			URL:  asset.URL,
			Size: asset.Size,
		}
		// In-app install is currently Windows-only and only meaningful when
		// the asset we picked is a swap-in-place .exe.
		info.CanAutoInstall = runtime.GOOS == "windows" &&
			strings.HasSuffix(strings.ToLower(asset.Name), ".exe")
	}
}

// DownloadAndInstallUpdate downloads the supplied asset, hands off to the
// platform-specific installer, and quits the app so the helper script can
// swap in the freshly downloaded binary.
//
// The download runs in a goroutine; progress is delivered via the
// "update:progress" runtime event with the following payload shapes:
//
//	{ phase: "download", downloaded: <int>, total: <int> }
//	{ phase: "applying" }
//	{ phase: "done" }
//	{ phase: "error", error: <string> }
//
// Only one install can be in flight at a time; calling this concurrently
// returns an error result.
func (a *App) DownloadAndInstallUpdate(req InstallUpdateRequest) SimpleResult {
	if a.ctx == nil {
		return SimpleResult{Error: "应用上下文未初始化"}
	}
	url := strings.TrimSpace(req.AssetURL)
	if url == "" {
		return SimpleResult{Error: "下载地址为空"}
	}
	name := strings.TrimSpace(req.AssetName)
	if name == "" {
		name = filepath.Base(url)
	}

	if runtime.GOOS != "windows" {
		return SimpleResult{Error: "当前平台暂不支持自动安装，请打开发布页手动下载"}
	}

	currentExe, err := update.CurrentExecutable()
	if err != nil {
		return SimpleResult{Error: "无法定位当前可执行文件: " + err.Error()}
	}

	updateMu.Lock()
	if updateRunning {
		updateMu.Unlock()
		return SimpleResult{Error: "已有更新任务在执行"}
	}
	updateRunning = true
	dlCtx, cancel := context.WithCancel(context.Background())
	updateCancel = cancel
	updateMu.Unlock()

	// Stage next to the running exe when possible, so the user can see the
	// new binary in the same folder they launched the app from and the
	// helper move is a same-volume rename. Falls back to %TEMP% when the
	// install dir is not writable (e.g. Program Files without elevation).
	stagingDir, fellBack, stageErr := update.ResolveStagingDir(currentExe)
	if stageErr != nil {
		updateMu.Lock()
		updateRunning = false
		updateCancel = nil
		updateMu.Unlock()
		return SimpleResult{Error: "无法准备更新目录: " + stageErr.Error()}
	}
	// `.new` suffix keeps the staged file from colliding with the currently
	// running exe when stagingDir is the install dir, and makes it visually
	// obvious which file is the in-flight download.
	stagedExe := filepath.Join(stagingDir, name+".new")
	a.logger.Printf("update: staging %s (fallback=%v)", stagedExe, fellBack)

	go func() {
		defer func() {
			updateMu.Lock()
			updateRunning = false
			updateCancel = nil
			updateMu.Unlock()
		}()

		a.emitUpdate(map[string]any{
			"phase":       "download",
			"downloaded":  int64(0),
			"total":       int64(0),
			"stagingPath": stagedExe,
			"fallback":    fellBack,
		})

		err := update.DownloadAsset(dlCtx, url, stagedExe, func(d, total int64) {
			a.emitUpdate(map[string]any{
				"phase":       "download",
				"downloaded":  d,
				"total":       total,
				"stagingPath": stagedExe,
				"fallback":    fellBack,
			})
		})
		if err != nil {
			cleanupStagedFiles(stagedExe)
			a.logger.Printf("update: download failed: %v", err)
			a.emitUpdate(map[string]any{
				"phase": "error",
				"error": humanizeUpdateErr(err),
			})
			return
		}

		a.emitUpdate(map[string]any{
			"phase":       "applying",
			"stagingPath": stagedExe,
			"fallback":    fellBack,
		})

		if err := update.Apply(stagedExe, currentExe); err != nil {
			cleanupStagedFiles(stagedExe)
			a.logger.Printf("update: apply failed: %v", err)
			a.emitUpdate(map[string]any{
				"phase": "error",
				"error": humanizeUpdateErr(err),
			})
			return
		}

		a.logger.Printf("update: handoff to installer ok; exiting in 800ms")
		a.emitUpdate(map[string]any{"phase": "done"})

		// Give the frontend a beat to render the "正在重启..." state before
		// we cut the runtime out from under it.
		time.Sleep(800 * time.Millisecond)
		wailsRuntime.Quit(a.ctx)
	}()

	return SimpleResult{OK: true}
}

// cleanupStagedFiles removes the staged exe and any half-written .part
// sibling produced by DownloadAsset.
//
// We do this on every failure / cancel branch so a user retrying after a
// crashed download doesn't accumulate stray TextMind-*.exe.new files
// next to their app. It is intentionally NOT called on the success path:
// the helper script moves stagedExe into place after we exit, and
// removing it here would race with that move.
func cleanupStagedFiles(stagedExe string) {
	if stagedExe == "" {
		return
	}
	_ = os.Remove(stagedExe)
	_ = os.Remove(stagedExe + ".part")
}

// CancelUpdate aborts an in-flight download. Safe to call when nothing is
// running.
func (a *App) CancelUpdate() SimpleResult {
	updateMu.Lock()
	cancel := updateCancel
	updateMu.Unlock()
	if cancel != nil {
		cancel()
	}
	return SimpleResult{OK: true}
}

// OpenReleasesPage opens the project's GitHub releases page in the user's
// default browser. Used as the fallback path on platforms that don't
// support in-app install, and as a "see all releases" link in the modal.
func (a *App) OpenReleasesPage() {
	if a.ctx == nil {
		return
	}
	url := fmt.Sprintf("https://github.com/%s/releases/latest", updateRepo)
	wailsRuntime.BrowserOpenURL(a.ctx, url)
}

func (a *App) emitUpdate(payload map[string]any) {
	if a.ctx == nil {
		return
	}
	wailsRuntime.EventsEmit(a.ctx, updateProgressEvent, payload)
}

// humanizeUpdateErr maps internal errors to messages suitable for the UI.
func humanizeUpdateErr(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "已取消"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "请求超时，请检查网络后重试"
	}
	if errors.Is(err, update.ErrUnsupported) {
		return "当前平台暂不支持自动安装，请打开发布页手动下载"
	}
	return err.Error()
}
