package update

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const sampleReleaseJSON = `{
  "tag_name": "v0.0.2",
  "name": "TextMind v0.0.2",
  "body": "## Changes\n- thing 1\n- thing 2\n",
  "html_url": "https://github.com/jycoast/TextMind/releases/tag/v0.0.2",
  "published_at": "2026-04-28T03:00:00Z",
  "draft": false,
  "prerelease": false,
  "assets": [
    {
      "name": "TextMind-v0.0.2-windows-amd64.exe",
      "browser_download_url": "https://example.com/win.exe",
      "size": 12345678,
      "content_type": "application/octet-stream"
    },
    {
      "name": "TextMind-v0.0.2-windows-amd64.zip",
      "browser_download_url": "https://example.com/win.zip",
      "size": 12300000,
      "content_type": "application/zip"
    },
    {
      "name": "TextMind-v0.0.2-linux-amd64",
      "browser_download_url": "https://example.com/linux",
      "size": 11000000,
      "content_type": "application/octet-stream"
    },
    {
      "name": "SHA256SUMS.txt",
      "browser_download_url": "https://example.com/sums.txt",
      "size": 200,
      "content_type": "text/plain"
    }
  ]
}`

func TestLatestReleaseHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/repos/jycoast/TextMind/releases/latest") {
			t.Errorf("path = %s", r.URL.Path)
		}
		if r.Header.Get("User-Agent") == "" {
			t.Errorf("missing User-Agent header")
		}
		if !strings.Contains(r.Header.Get("Accept"), "github") {
			t.Errorf("Accept = %q", r.Header.Get("Accept"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, sampleReleaseJSON)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	rel, err := c.LatestRelease(context.Background(), "jycoast/TextMind")
	if err != nil {
		t.Fatalf("LatestRelease: %v", err)
	}
	if rel.TagName != "v0.0.2" {
		t.Errorf("tag = %q", rel.TagName)
	}
	if len(rel.Assets) != 4 {
		t.Fatalf("assets = %d, want 4", len(rel.Assets))
	}
	if rel.Assets[0].URL != "https://example.com/win.exe" {
		t.Errorf("asset 0 url = %q", rel.Assets[0].URL)
	}
}

func TestLatestReleaseNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	_, err := c.LatestRelease(context.Background(), "jycoast/TextMind")
	if err == nil {
		t.Fatal("expected error for 404, got nil")
	}
	if !strings.Contains(err.Error(), "no published release") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestLatestReleaseValidation(t *testing.T) {
	c := NewClient()
	if _, err := c.LatestRelease(context.Background(), ""); err == nil {
		t.Error("expected error for empty repo")
	}
	if _, err := c.LatestRelease(context.Background(), "no-slash"); err == nil {
		t.Error("expected error for repo without slash")
	}
}

func TestPickAssetWindows(t *testing.T) {
	assets := []Asset{
		{Name: "TextMind-v0.0.2-windows-amd64.exe", URL: "exe"},
		{Name: "TextMind-v0.0.2-windows-amd64.zip", URL: "zip"},
		{Name: "TextMind-v0.0.2-linux-amd64", URL: "lin"},
		{Name: "SHA256SUMS.txt", URL: "sums"},
	}
	got, ok := PickAsset(assets, "windows", "amd64")
	if !ok {
		t.Fatal("expected to pick an asset")
	}
	if got.URL != "exe" {
		t.Errorf("picked %q, want exe (preferred over zip)", got.URL)
	}
}

func TestPickAssetLinuxAmd64(t *testing.T) {
	assets := []Asset{
		{Name: "TextMind-v0.0.2-windows-amd64.exe", URL: "exe"},
		{Name: "TextMind-v0.0.2-linux-amd64", URL: "lin"},
		{Name: "TextMind-v0.0.2-linux-amd64.tar.gz", URL: "lin-tar"},
	}
	got, ok := PickAsset(assets, "linux", "amd64")
	if !ok {
		t.Fatal("expected to pick an asset")
	}
	// Bare binary preferred over tarball.
	if got.URL != "lin" {
		t.Errorf("picked %q, want lin", got.URL)
	}
}

func TestPickAssetX86_64Synonym(t *testing.T) {
	assets := []Asset{
		{Name: "myapp-darwin-x86_64.dmg", URL: "mac"},
	}
	got, ok := PickAsset(assets, "darwin", "amd64")
	if !ok {
		t.Fatal("expected to pick darwin asset")
	}
	if got.URL != "mac" {
		t.Errorf("picked %q", got.URL)
	}
}

func TestPickAssetNoMatch(t *testing.T) {
	assets := []Asset{
		{Name: "TextMind-v0.0.2-android-arm64.apk", URL: "apk"},
	}
	if _, ok := PickAsset(assets, "windows", "amd64"); ok {
		t.Error("expected no match for unrelated assets")
	}
}

func TestPickAssetEmpty(t *testing.T) {
	if _, ok := PickAsset(nil, "windows", "amd64"); ok {
		t.Error("expected no match for nil assets")
	}
}

func TestLatestReleaseRateLimitedFromBody(t *testing.T) {
	resetAt := time.Now().Add(45 * time.Minute).Unix()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-RateLimit-Limit", "60")
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetAt))
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"message":"API rate limit exceeded for 1.2.3.4."}`)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	_, err := c.LatestRelease(context.Background(), "jycoast/TextMind")
	if err == nil {
		t.Fatal("expected rate-limit error, got nil")
	}
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited, got %v", err)
	}
	if !strings.Contains(err.Error(), "GitHub API 限流") {
		t.Errorf("expected friendly Chinese message, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "分钟") {
		t.Errorf("expected reset time hint in message, got %q", err.Error())
	}
}

func TestLatestReleaseRateLimitedNoHeaders(t *testing.T) {
	// Some proxies strip RateLimit-* headers; we should still recognise the
	// situation by the body wording alone.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"message":"API rate limit exceeded for 1.2.3.4."}`)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	_, err := c.LatestRelease(context.Background(), "jycoast/TextMind")
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited, got %v", err)
	}
}

func TestLatestReleaseExNotModified(t *testing.T) {
	const want = `"abc-etag"`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("If-None-Match") != want {
			t.Errorf("missing/wrong If-None-Match: %q", r.Header.Get("If-None-Match"))
		}
		w.Header().Set("ETag", want)
		w.WriteHeader(http.StatusNotModified)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	res, err := c.LatestReleaseEx(
		context.Background(),
		"jycoast/TextMind",
		LatestReleaseOptions{IfNoneMatch: want},
	)
	if !errors.Is(err, ErrNotModified) {
		t.Fatalf("expected ErrNotModified, got %v", err)
	}
	if res.ETag != want {
		t.Errorf("ETag = %q, want %q", res.ETag, want)
	}
}

func TestLatestReleaseExReturnsETag(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("ETag", `"v0.0.2-etag"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, sampleReleaseJSON)
	}))
	defer srv.Close()

	c := NewClient()
	c.BaseURL = srv.URL

	res, err := c.LatestReleaseEx(context.Background(), "jycoast/TextMind", LatestReleaseOptions{})
	if err != nil {
		t.Fatalf("LatestReleaseEx: %v", err)
	}
	if res.ETag != `"v0.0.2-etag"` {
		t.Errorf("ETag = %q", res.ETag)
	}
	if res.Release.TagName != "v0.0.2" {
		t.Errorf("tag = %q", res.Release.TagName)
	}
}
