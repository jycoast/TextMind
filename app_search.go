package main

import (
	"bufio"
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Quick Open — recursive file listing
// ---------------------------------------------------------------------------

type FileEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Relative string `json:"relative"`
}

type ListFilesResult struct {
	Files []FileEntry `json:"files"`
	Error string      `json:"error,omitempty"`
}

var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, ".svn": true, ".hg": true,
	"dist": true, "build": true, "__pycache__": true, ".idea": true,
	".vscode": true, "vendor": true, "target": true, ".DS_Store": true,
}

const maxFileEntries = 10000

func (a *App) ListAllFiles(root string) ListFilesResult {
	root = strings.TrimSpace(root)
	if root == "" {
		return ListFilesResult{Error: "工作区路径为空"}
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return ListFilesResult{Error: "路径无效: " + err.Error()}
	}

	var files []FileEntry
	_ = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if skipDirs[name] || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if len(files) >= maxFileEntries {
			return filepath.SkipAll
		}
		rel, _ := filepath.Rel(absRoot, path)
		files = append(files, FileEntry{
			Name:     d.Name(),
			Path:     path,
			Relative: filepath.ToSlash(rel),
		})
		return nil
	})

	if files == nil {
		files = []FileEntry{}
	}
	return ListFilesResult{Files: files}
}

// ---------------------------------------------------------------------------
// Global Search — text search across workspace
// ---------------------------------------------------------------------------

type SearchMatch struct {
	Path     string `json:"path"`
	Relative string `json:"relative"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Text     string `json:"text"`
}

type SearchResult struct {
	Matches    []SearchMatch `json:"matches"`
	TotalFiles int           `json:"totalFiles"`
	Error      string        `json:"error,omitempty"`
	Truncated  bool          `json:"truncated"`
}

type SearchOptions struct {
	Query           string `json:"query"`
	Root            string `json:"root"`
	CaseSensitive   bool   `json:"caseSensitive"`
	UseRegex        bool   `json:"useRegex"`
	WholeWord       bool   `json:"wholeWord"`
	IncludePattern  string `json:"includePattern"`
	ExcludePattern  string `json:"excludePattern"`
	MaxResults      int    `json:"maxResults"`
}

const defaultMaxResults = 500

var (
	searchMu     sync.Mutex
	searchCancel context.CancelFunc
)

func (a *App) SearchInFiles(opts SearchOptions) SearchResult {
	query := strings.TrimSpace(opts.Query)
	if query == "" {
		return SearchResult{Matches: []SearchMatch{}}
	}
	root := strings.TrimSpace(opts.Root)
	if root == "" {
		return SearchResult{Error: "工作区路径为空", Matches: []SearchMatch{}}
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return SearchResult{Error: "路径无效", Matches: []SearchMatch{}}
	}

	searchMu.Lock()
	if searchCancel != nil {
		searchCancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	searchCancel = cancel
	searchMu.Unlock()
	defer cancel()

	maxResults := opts.MaxResults
	if maxResults <= 0 {
		maxResults = defaultMaxResults
	}

	caseFold := !opts.CaseSensitive
	searchQuery := query
	if caseFold {
		searchQuery = strings.ToLower(query)
	}

	var matches []SearchMatch
	totalFiles := 0
	truncated := false

	includeExts := parseExtensionFilter(opts.IncludePattern)

	_ = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil || ctx.Err() != nil {
			return filepath.SkipAll
		}
		if d.IsDir() {
			name := d.Name()
			if skipDirs[name] || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if truncated {
			return filepath.SkipAll
		}

		if len(includeExts) > 0 {
			ext := strings.ToLower(filepath.Ext(d.Name()))
			if !includeExts[ext] {
				return nil
			}
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() > 2*1024*1024 {
			return nil
		}

		fileMatches := searchFile(path, absRoot, searchQuery, caseFold)
		if len(fileMatches) > 0 {
			totalFiles++
			for _, m := range fileMatches {
				matches = append(matches, m)
				if len(matches) >= maxResults {
					truncated = true
					return filepath.SkipAll
				}
			}
		}
		return nil
	})

	if matches == nil {
		matches = []SearchMatch{}
	}
	return SearchResult{
		Matches:    matches,
		TotalFiles: totalFiles,
		Truncated:  truncated,
	}
}

func (a *App) CancelSearch() SimpleResult {
	searchMu.Lock()
	if searchCancel != nil {
		searchCancel()
	}
	searchMu.Unlock()
	return SimpleResult{OK: true}
}

func searchFile(path, root, query string, caseFold bool) []SearchMatch {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	rel, _ := filepath.Rel(root, path)
	relSlash := filepath.ToSlash(rel)

	var matches []SearchMatch
	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		searchLine := line
		if caseFold {
			searchLine = strings.ToLower(line)
		}
		col := strings.Index(searchLine, query)
		if col < 0 {
			continue
		}
		displayLine := line
		if len(displayLine) > 300 {
			start := col - 50
			if start < 0 {
				start = 0
			}
			end := start + 200
			if end > len(displayLine) {
				end = len(displayLine)
			}
			displayLine = displayLine[start:end]
		}
		matches = append(matches, SearchMatch{
			Path:     path,
			Relative: relSlash,
			Line:     lineNum,
			Column:   col + 1,
			Text:     displayLine,
		})
		if len(matches) >= 50 {
			break
		}
	}
	return matches
}

func parseExtensionFilter(pattern string) map[string]bool {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return nil
	}
	exts := make(map[string]bool)
	for _, p := range strings.Split(pattern, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if !strings.HasPrefix(p, ".") {
			p = "." + p
		}
		exts[strings.ToLower(p)] = true
	}
	if len(exts) == 0 {
		return nil
	}
	return exts
}
