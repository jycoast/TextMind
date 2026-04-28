package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ErrRateLimited is returned by LatestRelease when GitHub's REST API rejects
// the request with HTTP 403 because the (unauthenticated) per-IP rate limit
// (60 req/hour) has been exhausted. Callers can use errors.Is to detect this
// and present a friendlier UX (e.g. "请稍后再试") rather than the raw JSON.
var ErrRateLimited = errors.New("update: github rate limit exceeded")

// ErrNotModified is returned when an If-None-Match conditional request gets
// a 304. Callers should treat this as "release is the same as last time" and
// reuse their cached payload. 304 responses do NOT count against the rate
// limit, which is exactly why we send conditional requests.
var ErrNotModified = errors.New("update: release not modified")

// LatestReleaseOptions controls a single LatestRelease call.
type LatestReleaseOptions struct {
	// IfNoneMatch is the ETag from a previous successful response. When set,
	// the server may answer 304 (mapped to ErrNotModified) without spending
	// any rate-limit quota.
	IfNoneMatch string
}

// LatestReleaseResult is the typed return of LatestReleaseEx; it adds the
// ETag the server returned so the caller can stash it for next time.
type LatestReleaseResult struct {
	Release Release
	ETag    string
}

// rateLimitInfo captures GitHub's RateLimit-* response headers. Zero
// timestamp means the header was absent.
type rateLimitInfo struct {
	Limit     int
	Remaining int
	ResetAt   time.Time
}

func parseRateLimitInfo(h http.Header) rateLimitInfo {
	info := rateLimitInfo{}
	if v := h.Get("X-RateLimit-Limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			info.Limit = n
		}
	}
	if v := h.Get("X-RateLimit-Remaining"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			info.Remaining = n
		}
	}
	if v := h.Get("X-RateLimit-Reset"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			info.ResetAt = time.Unix(n, 0)
		}
	}
	return info
}

// formatRateLimitErr produces the user-facing message for a rate-limited
// response. We embed the local reset time when GitHub provides it because
// that's the only actionable piece of info: there is nothing the user can
// do but wait for the window to roll over.
func formatRateLimitErr(info rateLimitInfo) error {
	if info.ResetAt.IsZero() {
		return fmt.Errorf("%w: 已触发 GitHub API 限流（匿名访问每小时 60 次），请稍后再试或在浏览器中查看 Release 页面", ErrRateLimited)
	}
	wait := time.Until(info.ResetAt).Round(time.Second)
	if wait < 0 {
		wait = 0
	}
	resetLocal := info.ResetAt.Local().Format("15:04:05")
	if wait <= 0 {
		return fmt.Errorf("%w: 已触发 GitHub API 限流，请重试", ErrRateLimited)
	}
	return fmt.Errorf("%w: 已触发 GitHub API 限流（匿名访问每小时 60 次），请于 %s（约 %s 后）重试，或在浏览器中查看 Release 页面",
		ErrRateLimited, resetLocal, humanizeDuration(wait))
}

func humanizeDuration(d time.Duration) string {
	if d <= 0 {
		return "片刻"
	}
	if d < time.Minute {
		return strconv.Itoa(int(d.Seconds())) + " 秒"
	}
	if d < time.Hour {
		return strconv.Itoa(int(d.Minutes())) + " 分钟"
	}
	h := int(d.Hours())
	m := int(d.Minutes()) - h*60
	if m == 0 {
		return strconv.Itoa(h) + " 小时"
	}
	return fmt.Sprintf("%d 小时 %d 分钟", h, m)
}

// looksLikeRateLimit returns true when a 403 response carries the textual
// signature GitHub uses for rate-limit failures. The header check alone is
// unreliable on some proxies that strip RateLimit-* headers, so we also
// peek at the body.
func looksLikeRateLimit(status int, headers http.Header, body []byte) bool {
	if status != http.StatusForbidden {
		return false
	}
	if v := headers.Get("X-RateLimit-Remaining"); v == "0" {
		return true
	}
	low := strings.ToLower(string(body))
	return strings.Contains(low, "api rate limit exceeded") ||
		strings.Contains(low, "rate limit") && strings.Contains(low, "exceeded")
}

// Release is the trimmed-down view of a GitHub release we care about.
type Release struct {
	TagName     string  `json:"tagName"`
	Name        string  `json:"name"`
	Body        string  `json:"body"`
	HTMLURL     string  `json:"htmlUrl"`
	PublishedAt string  `json:"publishedAt"`
	Prerelease  bool    `json:"prerelease"`
	Assets      []Asset `json:"assets"`
}

// Asset is one downloadable file attached to a release.
type Asset struct {
	Name        string `json:"name"`
	URL         string `json:"url"` // browser_download_url, direct CDN link
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

// rawRelease mirrors the GitHub REST shape (snake_case).
type rawRelease struct {
	TagName     string       `json:"tag_name"`
	Name        string       `json:"name"`
	Body        string       `json:"body"`
	HTMLURL     string       `json:"html_url"`
	PublishedAt string       `json:"published_at"`
	Prerelease  bool         `json:"prerelease"`
	Draft       bool         `json:"draft"`
	Assets      []rawAsset   `json:"assets"`
}

type rawAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
}

// Client talks to the GitHub releases API. Repo is "owner/name".
type Client struct {
	HTTPClient *http.Client
	BaseURL    string // override for tests; defaults to https://api.github.com
	UserAgent  string
}

// NewClient returns a Client with sensible defaults.
func NewClient() *Client {
	return &Client{
		HTTPClient: &http.Client{Timeout: 30 * time.Second},
		BaseURL:    "https://api.github.com",
		UserAgent:  "TextMind-Updater/1.0",
	}
}

// LatestRelease fetches the most recent non-draft release for the repo.
//
// repo must be "owner/name" (e.g. "jycoast/TextMind"). The function does NOT
// follow pagination — GitHub's /releases/latest endpoint returns a single
// release that excludes drafts and pre-releases, which is the correct
// behavior for an in-app updater.
//
// This is the simple form; callers that want to participate in conditional
// requests should use LatestReleaseEx so they can pass an ETag and recognise
// ErrNotModified.
func (c *Client) LatestRelease(ctx context.Context, repo string) (Release, error) {
	res, err := c.LatestReleaseEx(ctx, repo, LatestReleaseOptions{})
	if err != nil {
		return Release{}, err
	}
	return res.Release, nil
}

// LatestReleaseEx is the conditional-request form of LatestRelease.
//
// When opts.IfNoneMatch is set and the server replies 304 Not Modified,
// the call returns ErrNotModified; the caller should reuse its previously
// cached Release. 304 responses do not consume rate-limit quota, so always
// passing the last-seen ETag is the right thing to do.
//
// Errors:
//   - ErrRateLimited (wrap-checkable) when GitHub returns 403 + rate-limit
//     headers/body. The error message embeds the local reset time when
//     available.
//   - ErrNotModified for the 304 path described above.
//   - "update: no published release found" for 404.
//   - "update: github http <N>: <body>" for other non-2xx responses.
func (c *Client) LatestReleaseEx(ctx context.Context, repo string, opts LatestReleaseOptions) (LatestReleaseResult, error) {
	repo = strings.Trim(strings.TrimSpace(repo), "/")
	if repo == "" || !strings.Contains(repo, "/") {
		return LatestReleaseResult{}, errors.New("update: repo must be owner/name")
	}
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = "https://api.github.com"
	}
	url := base + "/repos/" + repo + "/releases/latest"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return LatestReleaseResult{}, fmt.Errorf("update: build request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	if v := strings.TrimSpace(opts.IfNoneMatch); v != "" {
		req.Header.Set("If-None-Match", v)
	}

	hc := c.HTTPClient
	if hc == nil {
		hc = http.DefaultClient
	}
	resp, err := hc.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return LatestReleaseResult{}, ctxErr
		}
		return LatestReleaseResult{}, fmt.Errorf("update: GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return LatestReleaseResult{ETag: resp.Header.Get("ETag")}, ErrNotModified
	}
	if resp.StatusCode == http.StatusNotFound {
		return LatestReleaseResult{}, errors.New("update: no published release found")
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		if looksLikeRateLimit(resp.StatusCode, resp.Header, body) {
			return LatestReleaseResult{}, formatRateLimitErr(parseRateLimitInfo(resp.Header))
		}
		return LatestReleaseResult{}, fmt.Errorf("update: github http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1*1024*1024))
	if err != nil {
		return LatestReleaseResult{}, fmt.Errorf("update: read body: %w", err)
	}

	var raw rawRelease
	if err := json.Unmarshal(body, &raw); err != nil {
		return LatestReleaseResult{}, fmt.Errorf("update: decode release: %w", err)
	}

	out := Release{
		TagName:     raw.TagName,
		Name:        raw.Name,
		Body:        raw.Body,
		HTMLURL:     raw.HTMLURL,
		PublishedAt: raw.PublishedAt,
		Prerelease:  raw.Prerelease,
		Assets:      make([]Asset, 0, len(raw.Assets)),
	}
	for _, a := range raw.Assets {
		out.Assets = append(out.Assets, Asset{
			Name:        a.Name,
			URL:         a.BrowserDownloadURL,
			Size:        a.Size,
			ContentType: a.ContentType,
		})
	}
	return LatestReleaseResult{Release: out, ETag: resp.Header.Get("ETag")}, nil
}

// PickAssetForCurrentPlatform returns the asset best matching the running
// OS+arch. Selection is heuristic by name (contains "windows-amd64" /
// "linux-amd64" / "darwin" etc.) and prefers .exe over .zip on Windows so
// we can swap binaries directly without unpacking.
//
// Returns ok=false if no plausible asset is found.
func PickAssetForCurrentPlatform(assets []Asset) (Asset, bool) {
	return PickAsset(assets, runtime.GOOS, runtime.GOARCH)
}

// PickAsset is the platform-explicit form, primarily for tests.
func PickAsset(assets []Asset, goos, goarch string) (Asset, bool) {
	if len(assets) == 0 {
		return Asset{}, false
	}
	osHints := osNameHints(goos)
	archHints := archNameHints(goarch)

	// First pass: name contains both an OS hint AND an arch hint.
	matches := make([]Asset, 0, len(assets))
	for _, a := range assets {
		lname := strings.ToLower(a.Name)
		if containsAny(lname, osHints) && containsAny(lname, archHints) {
			matches = append(matches, a)
		}
	}
	// Second pass: just an OS hint (some single-arch repos don't tag arch).
	if len(matches) == 0 {
		for _, a := range assets {
			lname := strings.ToLower(a.Name)
			if containsAny(lname, osHints) {
				matches = append(matches, a)
			}
		}
	}
	if len(matches) == 0 {
		return Asset{}, false
	}
	return preferExecutable(matches, goos), true
}

func osNameHints(goos string) []string {
	switch goos {
	case "windows":
		return []string{"windows", "win64", "win32", "win-"}
	case "darwin":
		return []string{"darwin", "macos", "mac-", "osx"}
	case "linux":
		return []string{"linux"}
	}
	return []string{goos}
}

func archNameHints(goarch string) []string {
	switch goarch {
	case "amd64":
		return []string{"amd64", "x86_64", "x64"}
	case "arm64":
		return []string{"arm64", "aarch64"}
	case "386":
		return []string{"386", "x86", "i386"}
	}
	return []string{goarch}
}

func containsAny(haystack string, needles []string) bool {
	for _, n := range needles {
		if strings.Contains(haystack, n) {
			return true
		}
	}
	return false
}

// preferExecutable picks .exe (Windows) or no-extension binary over zip/dmg
// archives so the caller can swap the file directly. Falls back to the
// first match when nothing obvious wins.
func preferExecutable(matches []Asset, goos string) Asset {
	wantExt := ""
	switch goos {
	case "windows":
		wantExt = ".exe"
	}
	if wantExt != "" {
		for _, a := range matches {
			if strings.HasSuffix(strings.ToLower(a.Name), wantExt) {
				return a
			}
		}
	}
	// On non-Windows prefer files without an archive extension.
	for _, a := range matches {
		ln := strings.ToLower(a.Name)
		if !strings.HasSuffix(ln, ".zip") &&
			!strings.HasSuffix(ln, ".tar.gz") &&
			!strings.HasSuffix(ln, ".tgz") &&
			!strings.HasSuffix(ln, ".dmg") &&
			!strings.HasSuffix(ln, ".sha256sums.txt") {
			return a
		}
	}
	return matches[0]
}
