package main

import (
	"context"
	"encoding/base64"
	"strings"
	"time"

	"TextMind/coscloud"
	"TextMind/persist"
)

// ---- DTOs (frontend camelCase) ----

// COSConfigDTO is the Wails-exported shape of the COS configuration. It
// mirrors persist.COSConfig field-for-field but uses camelCase JSON tags.
type COSConfigDTO struct {
	SecretID     string `json:"secretId"`
	SecretKey    string `json:"secretKey"`
	Region       string `json:"region"`
	Bucket       string `json:"bucket"`
	KeyPrefix    string `json:"keyPrefix"`
	CustomDomain string `json:"customDomain"`
}

// COSUploadResult is what UploadImageToCOS returns to the frontend.
//
// On success Error is empty; on failure URL is empty and Error carries a
// human-readable message ready to be shown via showTip().
type COSUploadResult struct {
	URL         string `json:"url"`
	Key         string `json:"key"`
	ContentType string `json:"contentType,omitempty"`
	Size        int64  `json:"size,omitempty"`
	Error       string `json:"error,omitempty"`
}

// ---- Wails-bound methods ----

// GetCOSConfig returns the persisted COS configuration. Missing fields come
// back empty so first-run users see a blank form.
func (a *App) GetCOSConfig() COSConfigDTO {
	cfg, err := persist.LoadCOSConfig(a.cosConfigPath)
	if err != nil {
		a.logger.Printf("cos: load config: %v", err)
	}
	return toDTOCOSConfig(cfg)
}

// SaveCOSConfig persists the COS configuration with mode 0600.
func (a *App) SaveCOSConfig(dto COSConfigDTO) SimpleResult {
	if err := persist.SaveCOSConfig(a.cosConfigPath, fromDTOCOSConfig(dto)); err != nil {
		a.logger.Printf("cos: save config: %v", err)
		return SimpleResult{Error: "保存失败: " + err.Error()}
	}
	return SimpleResult{OK: true}
}

// UploadImageToCOS uploads a base64-encoded image blob to the configured
// bucket and returns its public URL. filename is the suggested name from
// the clipboard; contentType is the MIME (may be empty).
//
// The frontend passes base64Data WITHOUT the "data:...;base64," prefix.
func (a *App) UploadImageToCOS(filename, contentType, base64Data string) COSUploadResult {
	base64Data = strings.TrimSpace(base64Data)
	if base64Data == "" {
		return COSUploadResult{Error: "上传内容为空"}
	}

	// Tolerate accidental data-URL prefix from the frontend.
	if i := strings.Index(base64Data, ","); i >= 0 && strings.HasPrefix(base64Data, "data:") {
		base64Data = base64Data[i+1:]
	}

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return COSUploadResult{Error: "图片解码失败: " + err.Error()}
	}

	cfg, err := persist.LoadCOSConfig(a.cosConfigPath)
	if err != nil {
		return COSUploadResult{Error: "读取 COS 配置失败: " + err.Error()}
	}

	ctx, cancel := context.WithTimeout(a.bgContext(), 45*time.Second)
	defer cancel()

	res, err := coscloud.Upload(ctx, persistToCloudConfig(cfg), filename, contentType, data)
	if err != nil {
		// Surface a friendly message; the SDK's error is usually verbose
		// (status code + xml body), so trim it down for the toast.
		msg := err.Error()
		if len(msg) > 240 {
			msg = msg[:240] + "..."
		}
		a.logger.Printf("cos: upload %q failed: %v", filename, err)
		return COSUploadResult{Error: "上传失败: " + msg}
	}

	return COSUploadResult{
		URL:         res.URL,
		Key:         res.Key,
		ContentType: res.ContentType,
		Size:        res.Size,
	}
}

// ---- helpers ----

func toDTOCOSConfig(c persist.COSConfig) COSConfigDTO {
	return COSConfigDTO{
		SecretID:     c.SecretID,
		SecretKey:    c.SecretKey,
		Region:       c.Region,
		Bucket:       c.Bucket,
		KeyPrefix:    c.KeyPrefix,
		CustomDomain: c.CustomDomain,
	}
}

func fromDTOCOSConfig(dto COSConfigDTO) persist.COSConfig {
	return persist.COSConfig{
		SecretID:     strings.TrimSpace(dto.SecretID),
		SecretKey:    strings.TrimSpace(dto.SecretKey),
		Region:       strings.TrimSpace(dto.Region),
		Bucket:       strings.TrimSpace(dto.Bucket),
		KeyPrefix:    coscloud.NormalizeKeyPrefix(dto.KeyPrefix),
		CustomDomain: strings.TrimRight(strings.TrimSpace(dto.CustomDomain), "/"),
	}
}

func persistToCloudConfig(c persist.COSConfig) coscloud.Config {
	return coscloud.Config{
		SecretID:     c.SecretID,
		SecretKey:    c.SecretKey,
		Region:       c.Region,
		Bucket:       c.Bucket,
		KeyPrefix:    coscloud.NormalizeKeyPrefix(c.KeyPrefix),
		CustomDomain: strings.TrimRight(strings.TrimSpace(c.CustomDomain), "/"),
	}
}

// bgContext picks the app context when available, falling back to
// context.Background. Used so uploads still work very early at startup.
func (a *App) bgContext() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}
