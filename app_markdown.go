package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const maxMarkdownImageBytes int64 = 15 * 1024 * 1024
const maxMarkdownExportHTMLBytes = 100 * 1024 * 1024

type MarkdownImageResult struct {
	Path    string `json:"path"`
	DataURL string `json:"dataUrl"`
	Error   string `json:"error"`
}

type MarkdownLinkResult struct {
	Path     string `json:"path"`
	Fragment string `json:"fragment"`
	Error    string `json:"error"`
}

var markdownImageMIMEs = map[string]string{
	".avif": "image/avif",
	".bmp":  "image/bmp",
	".gif":  "image/gif",
	".ico":  "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".svg":  "image/svg+xml",
	".webp": "image/webp",
}

func resolveMarkdownPath(documentPath, reference string) (string, string, error) {
	documentPath = strings.TrimSpace(documentPath)
	reference = strings.TrimSpace(reference)
	if documentPath == "" {
		return "", "", errors.New("Markdown 文档尚未保存，无法解析相对路径")
	}
	if reference == "" {
		return "", "", errors.New("资源路径为空")
	}

	parsed, err := url.Parse(reference)
	if err != nil {
		return "", "", fmt.Errorf("资源路径无效: %w", err)
	}
	if parsed.Scheme != "" || parsed.Host != "" {
		return "", "", errors.New("只支持当前文档的本地相对路径")
	}
	decodedPath, err := url.PathUnescape(parsed.Path)
	if err != nil {
		return "", "", fmt.Errorf("资源路径编码无效: %w", err)
	}
	if strings.TrimSpace(decodedPath) == "" {
		return "", parsed.Fragment, nil
	}

	documentAbs, err := filepath.Abs(documentPath)
	if err != nil {
		return "", "", fmt.Errorf("文档路径无效: %w", err)
	}
	localPath := filepath.FromSlash(decodedPath)
	if !filepath.IsAbs(localPath) {
		localPath = filepath.Join(filepath.Dir(documentAbs), localPath)
	}
	resolved, err := filepath.Abs(filepath.Clean(localPath))
	if err != nil {
		return "", "", fmt.Errorf("无法解析资源路径: %w", err)
	}
	return resolved, parsed.Fragment, nil
}

// ResolveMarkdownLink resolves a relative Markdown link against the current
// document. The frontend still opens the file through the normal tab command,
// so dirty-file checks, recent files, and file watching keep working.
func (a *App) ResolveMarkdownLink(documentPath, reference string) MarkdownLinkResult {
	path, fragment, err := resolveMarkdownPath(documentPath, reference)
	if err != nil {
		return MarkdownLinkResult{Error: err.Error()}
	}
	if path == "" {
		return MarkdownLinkResult{Fragment: fragment}
	}
	info, err := os.Stat(path)
	if err != nil {
		return MarkdownLinkResult{Error: "链接文件不存在: " + err.Error()}
	}
	if !info.Mode().IsRegular() {
		return MarkdownLinkResult{Error: "链接目标不是文件"}
	}
	return MarkdownLinkResult{Path: path, Fragment: fragment}
}

// ResolveMarkdownImage reads a local image as a data URL. Only known image
// extensions are accepted and the size cap avoids accidentally loading very
// large or unrelated files into the WebView.
func (a *App) ResolveMarkdownImage(documentPath, source string) MarkdownImageResult {
	path, _, err := resolveMarkdownPath(documentPath, source)
	if err != nil {
		return MarkdownImageResult{Error: err.Error()}
	}
	ext := strings.ToLower(filepath.Ext(path))
	contentType, ok := markdownImageMIMEs[ext]
	if !ok {
		return MarkdownImageResult{Error: "不支持的本地图片格式: " + ext}
	}
	info, err := os.Stat(path)
	if err != nil {
		return MarkdownImageResult{Error: "图片不存在: " + err.Error()}
	}
	if !info.Mode().IsRegular() {
		return MarkdownImageResult{Error: "图片路径不是文件"}
	}
	if info.Size() > maxMarkdownImageBytes {
		return MarkdownImageResult{Error: "本地图片超过 15 MB 限制"}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return MarkdownImageResult{Error: "读取图片失败: " + err.Error()}
	}
	if detected := http.DetectContentType(data); detected != "application/octet-stream" && ext != ".svg" {
		if strings.HasPrefix(detected, "image/") {
			contentType = detected
		}
	}
	if registered := mime.TypeByExtension(ext); registered != "" && strings.HasPrefix(registered, "image/") {
		contentType = strings.SplitN(registered, ";", 2)[0]
	}
	return MarkdownImageResult{
		Path:    path,
		DataURL: "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data),
	}
}

func markdownPDFName(defaultName string) string {
	name := strings.TrimSpace(defaultName)
	if name == "" {
		name = "document"
	}
	ext := filepath.Ext(name)
	switch strings.ToLower(ext) {
	case ".md", ".markdown", ".mdx", ".pdf":
		name = strings.TrimSuffix(name, ext)
	}
	return name + ".pdf"
}

func findEdgeExecutable() (string, error) {
	if path, err := exec.LookPath("msedge.exe"); err == nil {
		return path, nil
	}
	if path, err := exec.LookPath("msedge"); err == nil {
		return path, nil
	}
	for _, root := range []string{
		os.Getenv("PROGRAMFILES(X86)"),
		os.Getenv("PROGRAMFILES"),
		os.Getenv("LOCALAPPDATA"),
	} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		candidate := filepath.Join(root, "Microsoft", "Edge", "Application", "msedge.exe")
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
			return candidate, nil
		}
	}
	return "", errors.New("未找到 Microsoft Edge，无法生成 PDF")
}

func markdownHTMLFileURL(path string) string {
	slashed := filepath.ToSlash(path)
	if strings.HasPrefix(slashed, "//") {
		parts := strings.SplitN(strings.TrimPrefix(slashed, "//"), "/", 2)
		fileURL := url.URL{Scheme: "file", Host: parts[0]}
		if len(parts) > 1 {
			fileURL.Path = "/" + parts[1]
		}
		return fileURL.String()
	}
	if len(slashed) >= 2 && slashed[1] == ':' {
		slashed = "/" + slashed
	}
	return (&url.URL{Scheme: "file", Path: slashed}).String()
}

func printHTMLToPDF(edge, profileDir, htmlPath, pdfPath string) error {
	exportCtx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	command := exec.CommandContext(
		exportCtx,
		edge,
		"--headless",
		"--disable-gpu",
		"--disable-extensions",
		"--no-first-run",
		"--user-data-dir="+profileDir,
		"--no-pdf-header-footer",
		"--run-all-compositor-stages-before-draw",
		"--virtual-time-budget=3000",
		"--print-to-pdf="+pdfPath,
		markdownHTMLFileURL(htmlPath),
	)
	output, err := command.CombinedOutput()
	if exportCtx.Err() == context.DeadlineExceeded {
		return errors.New("导出 PDF 超时，请检查文档中的远程资源")
	}
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if len(detail) > 500 {
			detail = detail[:500]
		}
		if detail != "" {
			return errors.New("Edge 生成 PDF 失败: " + detail)
		}
		return fmt.Errorf("Edge 生成 PDF 失败: %w", err)
	}
	info, err := os.Stat(pdfPath)
	if err != nil || info.Size() == 0 {
		return errors.New("Edge 未生成有效的 PDF 文件")
	}
	return nil
}

// ExportMarkdownPDF prints a fully rendered, standalone HTML document to PDF
// with Microsoft Edge's headless mode. Edge ships with supported Windows
// versions, so this avoids bundling a second browser or a PDF layout engine.
func (a *App) ExportMarkdownPDF(defaultName, html string) SaveFileResult {
	if a.ctx == nil {
		return SaveFileResult{Error: "应用上下文未初始化"}
	}
	if strings.TrimSpace(html) == "" {
		return SaveFileResult{Error: "没有可导出的 Markdown 内容"}
	}
	if len(html) > maxMarkdownExportHTMLBytes {
		return SaveFileResult{Error: "导出内容超过 100 MB 限制"}
	}

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出 Markdown 为 PDF",
		DefaultFilename: markdownPDFName(defaultName),
		Filters: []runtime.FileFilter{
			{DisplayName: "PDF 文档 (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		return SaveFileResult{Error: "选择 PDF 保存位置失败: " + err.Error()}
	}
	if strings.TrimSpace(path) == "" {
		return SaveFileResult{}
	}
	if !strings.EqualFold(filepath.Ext(path), ".pdf") {
		path += ".pdf"
	}

	edge, err := findEdgeExecutable()
	if err != nil {
		return SaveFileResult{Error: err.Error()}
	}
	temp, err := os.CreateTemp("", "textmind-markdown-*.html")
	if err != nil {
		return SaveFileResult{Error: "创建 PDF 临时文件失败: " + err.Error()}
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return SaveFileResult{Error: "设置 PDF 临时文件权限失败: " + err.Error()}
	}
	if _, err := temp.WriteString(html); err != nil {
		temp.Close()
		return SaveFileResult{Error: "写入 PDF 临时文件失败: " + err.Error()}
	}
	if err := temp.Close(); err != nil {
		return SaveFileResult{Error: "关闭 PDF 临时文件失败: " + err.Error()}
	}
	profileDir, err := os.MkdirTemp("", "textmind-edge-profile-*")
	if err != nil {
		return SaveFileResult{Error: "创建 Edge 临时配置失败: " + err.Error()}
	}
	defer os.RemoveAll(profileDir)

	if err := printHTMLToPDF(edge, profileDir, tempPath, path); err != nil {
		return SaveFileResult{Error: err.Error()}
	}
	return SaveFileResult{Name: filepath.Base(path), Path: path}
}
