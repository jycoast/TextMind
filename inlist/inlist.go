package inlist

import "strings"

// QuotedCommaLines turns newline-separated values into one comma-separated line
// suitable for pasting into SQL IN (...) clauses.
// Each non-empty line (after TrimSpace) becomes one quoted value; interior
// double quotes are escaped by doubling.
func QuotedCommaLines(input string) (result string, count int) {
	input = strings.ReplaceAll(input, "\r\n", "\n")
	lines := strings.Split(input, "\n")
	parts := make([]string, 0, len(lines))
	for _, line := range lines {
		s := strings.TrimSpace(line)
		if s == "" {
			continue
		}
		escaped := strings.ReplaceAll(s, `"`, `""`)
		parts = append(parts, `"`+escaped+`"`)
	}
	if len(parts) == 0 {
		return "", 0
	}
	return strings.Join(parts, ","), len(parts)
}
