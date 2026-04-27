// Package extract provides text extraction primitives used by the editor.
//
// It supports three modes:
//   - ModeFilter:  keep entire lines that match (or, with Invert, do not match)
//                  a keyword or regular expression.
//   - ModeCapture: pull substrings out of the input via a regular expression
//                  capture group.
//   - ModeBlock:   carve multi-line blocks out of the input, delimited by a
//                  start regex and an optional end regex.
//
// All three modes share a single Options/Result shape and run synchronously
// over an in-memory string. Streaming is intentionally out of scope here.
package extract

import (
	"fmt"
	"regexp"
	"strings"
)

// Mode selects which extraction algorithm Run dispatches to.
type Mode string

const (
	ModeFilter  Mode = "filter"
	ModeCapture Mode = "capture"
	ModeBlock   Mode = "block"
)

// Options bundles all knobs across the three modes. Fields are ignored when
// they are not relevant to the active Mode.
type Options struct {
	Mode Mode `json:"mode"`

	Pattern         string `json:"pattern"`
	UseRegex        bool   `json:"useRegex"`
	CaseInsensitive bool   `json:"caseInsensitive"`
	Invert          bool   `json:"invert"`
	Dedup           bool   `json:"dedup"`

	// Capture mode.
	CaptureGroup int    `json:"captureGroup"`
	Joiner       string `json:"joiner"`

	// Block mode.
	BlockEnd        string `json:"blockEnd"`
	IncludeBoundary bool   `json:"includeBoundary"`
}

// Result is what every mode returns. Error is non-empty when the request was
// invalid (e.g. bad regex, empty pattern, capture group out of range).
type Result struct {
	Text       string `json:"text"`
	MatchCount int    `json:"matchCount"`
	LineCount  int    `json:"lineCount"`
	Error      string `json:"error"`
}

// Run dispatches to one of the per-mode implementations. An empty input is
// always valid and produces an empty result; an empty Pattern is rejected.
func Run(input string, opts Options) Result {
	if strings.TrimSpace(opts.Pattern) == "" {
		return Result{Error: "提取模式不能为空"}
	}
	switch opts.Mode {
	case ModeFilter, "":
		return filterLines(input, opts)
	case ModeCapture:
		return captureGroups(input, opts)
	case ModeBlock:
		return extractBlocks(input, opts)
	default:
		return Result{Error: fmt.Sprintf("未知的提取模式: %q", string(opts.Mode))}
	}
}

// filterLines keeps each line that matches (or does not match, when Invert is
// true) the configured pattern. It optionally deduplicates the kept lines
// while preserving first-seen order.
func filterLines(input string, opts Options) Result {
	matcher, err := buildLineMatcher(opts)
	if err != nil {
		return Result{Error: err.Error()}
	}

	lines := splitLines(input)
	out := make([]string, 0, len(lines))
	seen := make(map[string]struct{})
	matches := 0

	for _, line := range lines {
		hit := matcher(line)
		if opts.Invert {
			hit = !hit
		}
		if !hit {
			continue
		}
		matches++
		if opts.Dedup {
			if _, ok := seen[line]; ok {
				continue
			}
			seen[line] = struct{}{}
		}
		out = append(out, line)
	}

	return Result{
		Text:       strings.Join(out, "\n"),
		MatchCount: matches,
		LineCount:  len(out),
	}
}

// captureGroups pulls substrings via regexp capture. CaptureGroup 0 means the
// full match; positive values pick the Nth subgroup. Out-of-range groups are
// rejected up front rather than silently producing empty strings.
func captureGroups(input string, opts Options) Result {
	pattern := opts.Pattern
	if !opts.UseRegex {
		pattern = regexp.QuoteMeta(pattern)
	}
	if opts.CaseInsensitive {
		pattern = "(?i)" + pattern
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return Result{Error: "正则编译失败: " + err.Error()}
	}

	group := opts.CaptureGroup
	if group < 0 {
		return Result{Error: "捕获组序号不能为负数"}
	}
	if group > re.NumSubexp() {
		return Result{Error: fmt.Sprintf("捕获组序号超出范围: %d (最多 %d)", group, re.NumSubexp())}
	}

	all := re.FindAllStringSubmatch(input, -1)
	out := make([]string, 0, len(all))
	seen := make(map[string]struct{})
	matches := 0

	for _, m := range all {
		if group >= len(m) {
			continue
		}
		matches++
		val := m[group]
		if opts.Invert {
			// "Invert" in capture mode is intentionally a no-op: there is no
			// meaningful inverse of a captured group. We keep the field so the
			// frontend can use a single shared options struct.
			_ = val
		}
		if opts.Dedup {
			if _, ok := seen[val]; ok {
				continue
			}
			seen[val] = struct{}{}
		}
		out = append(out, val)
	}

	joiner := opts.Joiner
	if joiner == "" {
		joiner = "\n"
	}

	return Result{
		Text:       strings.Join(out, joiner),
		MatchCount: matches,
		LineCount:  len(out),
	}
}

// extractBlocks scans input line by line and accumulates ranges that start at
// a Pattern match and end at a BlockEnd match (or EOF, or — when BlockEnd is
// empty — the next blank line). IncludeBoundary controls whether the start
// and end lines themselves are part of the emitted block.
func extractBlocks(input string, opts Options) Result {
	startRe, err := buildRegex(opts.Pattern, opts.UseRegex, opts.CaseInsensitive)
	if err != nil {
		return Result{Error: "起始正则编译失败: " + err.Error()}
	}

	var endRe *regexp.Regexp
	useBlankAsEnd := strings.TrimSpace(opts.BlockEnd) == ""
	if !useBlankAsEnd {
		endRe, err = buildRegex(opts.BlockEnd, opts.UseRegex, opts.CaseInsensitive)
		if err != nil {
			return Result{Error: "结束正则编译失败: " + err.Error()}
		}
	}

	lines := splitLines(input)
	blocks := make([][]string, 0)
	var current []string
	inBlock := false
	matches := 0

	flush := func() {
		if !inBlock {
			return
		}
		if len(current) > 0 {
			blocks = append(blocks, current)
		}
		current = nil
		inBlock = false
	}

	for _, line := range lines {
		if !inBlock {
			if startRe.MatchString(line) {
				matches++
				inBlock = true
				current = current[:0]
				if opts.IncludeBoundary {
					current = append(current, line)
				}
			}
			continue
		}

		// We're inside a block; check for end first so a single line can be
		// both start and end (uncommon but supported).
		isEnd := false
		if useBlankAsEnd {
			isEnd = strings.TrimSpace(line) == ""
		} else {
			isEnd = endRe.MatchString(line)
		}

		if isEnd {
			if opts.IncludeBoundary && !useBlankAsEnd {
				current = append(current, line)
			}
			flush()
			continue
		}
		current = append(current, line)
	}
	flush()

	pieces := make([]string, 0, len(blocks))
	totalLines := 0
	for _, b := range blocks {
		pieces = append(pieces, strings.Join(b, "\n"))
		totalLines += len(b)
	}

	return Result{
		Text:       strings.Join(pieces, "\n\n"),
		MatchCount: matches,
		LineCount:  totalLines,
	}
}

// buildLineMatcher returns a predicate that decides whether a single line
// matches the configured pattern. Keyword (non-regex) mode uses Contains so
// users do not have to escape regex metacharacters.
func buildLineMatcher(opts Options) (func(string) bool, error) {
	if opts.UseRegex {
		re, err := buildRegex(opts.Pattern, true, opts.CaseInsensitive)
		if err != nil {
			return nil, fmt.Errorf("正则编译失败: %w", err)
		}
		return re.MatchString, nil
	}
	needle := opts.Pattern
	if opts.CaseInsensitive {
		lower := strings.ToLower(needle)
		return func(s string) bool {
			return strings.Contains(strings.ToLower(s), lower)
		}, nil
	}
	return func(s string) bool {
		return strings.Contains(s, needle)
	}, nil
}

// buildRegex compiles a pattern, optionally treating it as a literal keyword
// and optionally making it case-insensitive.
func buildRegex(pattern string, useRegex, caseInsensitive bool) (*regexp.Regexp, error) {
	if !useRegex {
		pattern = regexp.QuoteMeta(pattern)
	}
	if caseInsensitive {
		pattern = "(?i)" + pattern
	}
	return regexp.Compile(pattern)
}

// splitLines normalises CRLF and splits on \n. We intentionally do NOT trim a
// trailing empty element when input ends in \n, because callers operating in
// block mode rely on a final blank line to close an open block.
func splitLines(input string) []string {
	input = strings.ReplaceAll(input, "\r\n", "\n")
	if input == "" {
		return nil
	}
	return strings.Split(input, "\n")
}
