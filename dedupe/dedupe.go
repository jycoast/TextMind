package dedupe

import "strings"

// Lines removes duplicate lines while preserving first-seen order.
func Lines(input string) string {
	lines := strings.Split(input, "\n")
	seen := make(map[string]struct{}, len(lines))
	result := make([]string, 0, len(lines))

	for _, line := range lines {
		item := strings.TrimSpace(line)
		if item == "" {
			continue
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}

	return strings.Join(result, "\n")
}

// LinesAndRemoved removes duplicate lines and returns the unique result
// with the number of removed duplicate rows.
func LinesAndRemoved(input string) (string, int) {
	lines := strings.Split(input, "\n")
	seen := make(map[string]struct{}, len(lines))
	result := make([]string, 0, len(lines))
	removed := 0

	for _, line := range lines {
		item := strings.TrimSpace(line)
		if item == "" {
			continue
		}
		if _, exists := seen[item]; exists {
			removed++
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}

	return strings.Join(result, "\n"), removed
}

// OnlySingletonLines keeps only non-empty trimmed lines whose value appears exactly once
// in the input. Order follows the original line order (first occurrence of each kept line).
func OnlySingletonLines(input string) (result string, removed int) {
	lines := strings.Split(input, "\n")
	items := make([]string, 0, len(lines))
	for _, line := range lines {
		item := strings.TrimSpace(line)
		if item == "" {
			continue
		}
		items = append(items, item)
	}
	counts := make(map[string]int, len(items))
	for _, item := range items {
		counts[item]++
	}
	out := make([]string, 0, len(items))
	for _, line := range lines {
		item := strings.TrimSpace(line)
		if item == "" {
			continue
		}
		if counts[item] == 1 {
			out = append(out, item)
		}
	}
	removed = len(items) - len(out)
	return strings.Join(out, "\n"), removed
}
