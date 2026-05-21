// Package coscloud wraps the Tencent Cloud COS (Cloud Object Storage) SDK
// for the limited use case TextMind needs: uploading a single image blob
// and returning a stable public URL.
//
// The package is intentionally tiny — it does no caching, no retries beyond
// what the SDK does internally, and no signing tricks (long-lived
// SecretID/SecretKey only). STS / temporary credentials should be added at a
// higher layer if needed.
package coscloud

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/tencentyun/cos-go-sdk-v5"
)

// Config carries all parameters required to talk to a bucket. The fields are
// the same ones persisted on disk (see persist.COSConfig), repeated here so
// this package stays independent of the persist layer.
type Config struct {
	SecretID     string
	SecretKey    string
	Region       string
	Bucket       string
	KeyPrefix    string // already-normalised: no leading "/", always trailing "/" when non-empty
	CustomDomain string // optional; absolute URL ("https://cdn.example.com")
}

// UploadResult is what the caller — typically the frontend via a Wails
// binding — gets back after a successful upload.
type UploadResult struct {
	Key         string // object key inside the bucket
	URL         string // public URL the markdown image link should use
	ContentType string
	Size        int64
}

// Upload pushes data to the configured bucket and returns the public URL.
//
// filename is the original (or suggested) file name from the clipboard. It
// is used purely to derive the key extension; the actual key on the server
// is randomized to avoid collisions and prevent leaking local paths.
//
// contentType may be empty; when empty the SDK detects from the bytes.
func Upload(
	ctx context.Context,
	cfg Config,
	filename string,
	contentType string,
	data []byte,
) (UploadResult, error) {
	if err := ValidateConfig(cfg); err != nil {
		return UploadResult{}, err
	}
	if len(data) == 0 {
		return UploadResult{}, errors.New("coscloud: empty payload")
	}

	bucketURL, err := bucketEndpoint(cfg)
	if err != nil {
		return UploadResult{}, err
	}

	client := cos.NewClient(&cos.BaseURL{BucketURL: bucketURL}, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  cfg.SecretID,
			SecretKey: cfg.SecretKey,
		},
		// 30s is enough for a few-MB screenshot over typical broadband.
		Timeout: 30 * time.Second,
	})

	key := buildKey(cfg.KeyPrefix, filename)

	putOpts := &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{
			ContentType: strings.TrimSpace(contentType),
		},
	}

	if _, err := client.Object.Put(ctx, key, bytes.NewReader(data), putOpts); err != nil {
		return UploadResult{}, fmt.Errorf("cos put: %w", err)
	}

	publicURL, err := publicURLFor(cfg, key)
	if err != nil {
		return UploadResult{}, err
	}

	return UploadResult{
		Key:         key,
		URL:         publicURL,
		ContentType: strings.TrimSpace(contentType),
		Size:        int64(len(data)),
	}, nil
}

// ValidateConfig returns nil when cfg has the minimum fields required to
// upload, otherwise a descriptive error suitable for showing to the user.
func ValidateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.SecretID) == "" {
		return errors.New("coscloud: SecretID 未配置")
	}
	if strings.TrimSpace(cfg.SecretKey) == "" {
		return errors.New("coscloud: SecretKey 未配置")
	}
	if strings.TrimSpace(cfg.Region) == "" {
		return errors.New("coscloud: Region 未配置（如 ap-guangzhou）")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return errors.New("coscloud: Bucket 未配置（如 yourbucket-1250000000）")
	}
	return nil
}

// NormalizeKeyPrefix strips leading slashes and guarantees a trailing slash
// when the value is non-empty, so the rest of the code can blindly concat.
func NormalizeKeyPrefix(prefix string) string {
	p := strings.TrimSpace(prefix)
	if p == "" {
		return ""
	}
	p = strings.TrimLeft(p, "/")
	if !strings.HasSuffix(p, "/") {
		p += "/"
	}
	return p
}

// ---- internals --------------------------------------------------------

func bucketEndpoint(cfg Config) (*url.URL, error) {
	endpoint := fmt.Sprintf(
		"https://%s.cos.%s.myqcloud.com",
		strings.TrimSpace(cfg.Bucket),
		strings.TrimSpace(cfg.Region),
	)
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("coscloud: invalid bucket endpoint: %w", err)
	}
	return u, nil
}

func publicURLFor(cfg Config, key string) (string, error) {
	if strings.TrimSpace(cfg.CustomDomain) != "" {
		base := strings.TrimRight(strings.TrimSpace(cfg.CustomDomain), "/")
		return base + "/" + key, nil
	}
	u, err := bucketEndpoint(cfg)
	if err != nil {
		return "", err
	}
	u.Path = "/" + key
	return u.String(), nil
}

func buildKey(prefix, filename string) string {
	prefix = NormalizeKeyPrefix(prefix)
	ext := strings.ToLower(path.Ext(strings.TrimSpace(filename)))
	if ext == "" || len(ext) > 8 {
		ext = ".png"
	}
	now := time.Now()
	short := randomHex(6)
	name := fmt.Sprintf("%d-%s%s", now.UnixNano(), short, ext)
	return prefix + now.Format("2006/01") + "/" + name
}

func randomHex(bytesN int) string {
	buf := make([]byte, bytesN)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}
