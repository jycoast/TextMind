package highlight

// CaretCell returns the grid row and column for the caret before logical rune index `cursor`
// (cursor in [0, len([]rune(text))]).
func CaretCell(text string, cursor int, tabWidth int) (row, col int) {
	runes := []rune(text)
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(runes) {
		cursor = len(runes)
	}
	if tabWidth <= 0 {
		tabWidth = 4
	}

	row = 0
	lineStart := 0
	for i := 0; i <= len(runes); i++ {
		if i == len(runes) || runes[i] == '\n' {
			line := runes[lineStart:i]
			lineEnd := lineStart + len(line)
			if cursor >= lineStart && cursor <= lineEnd {
				off := cursor - lineStart
				var prefix []rune
				if off > 0 {
					prefix = line[:off]
				}
				col = VisualCol(prefix, tabWidth)
				return row, col
			}
			row++
			lineStart = i + 1
		}
	}
	return row, 0
}

// VisualCol returns the visual column (cell index) at the end of prefix within one line.
func VisualCol(prefix []rune, tabWidth int) int {
	if tabWidth <= 0 {
		tabWidth = 4
	}
	cells := 0
	for _, r := range prefix {
		cells++
		if r == '\t' {
			next := nextTab(cells-1, tabWidth)
			for cells < next {
				cells++
			}
		}
	}
	return cells
}

// LogicalAtCell maps a grid (row, col) hit to a logical caret index in text (half-open positions 0..len(runes)).
func LogicalAtCell(text string, targetRow, targetCol int, tabWidth int) int {
	runes := []rune(text)
	if tabWidth <= 0 {
		tabWidth = 4
	}
	row := 0
	lineStart := 0
	for i := 0; i <= len(runes); i++ {
		if i == len(runes) || runes[i] == '\n' {
			line := runes[lineStart:i]
			if row == targetRow {
				off := logicalOffsetInLineForCol(line, targetCol, tabWidth)
				return lineStart + off
			}
			row++
			lineStart = i + 1
		}
	}
	return len(runes)
}

func logicalOffsetInLineForCol(line []rune, targetCol int, tabWidth int) int {
	cells := 0
	for j, r := range line {
		if cells >= targetCol {
			return j
		}
		cells++
		if r == '\t' {
			next := nextTab(cells-1, tabWidth)
			for cells < next {
				if cells == targetCol {
					return j
				}
				cells++
			}
		}
	}
	if cells == targetCol {
		return len(line)
	}
	return len(line)
}
