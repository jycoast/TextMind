package highlight

import (
	"math"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// BuildRows converts text into TextGrid rows with per-cell styles. Tab expands like Fyne's TextGrid.parseRows.
// selLow, selHigh are half-open logical rune indices into text (each '\n' counts as one rune).
func BuildRows(text string, th fyne.Theme, tabWidth int, selLow, selHigh int) []widget.TextGridRow {
	v := fyne.CurrentApp().Settings().ThemeVariant()
	if tabWidth <= 0 {
		tabWidth = 4
	}

	runes := []rune(text)
	var rows []widget.TextGridRow

	lineStart := 0
	for i := 0; i <= len(runes); i++ {
		if i == len(runes) || runes[i] == '\n' {
			row := buildLineCells(runes[lineStart:i], lineStart, th, v, tabWidth, selLow, selHigh)
			rows = append(rows, row)
			lineStart = i + 1
		}
	}
	return rows
}

func buildLineCells(line []rune, baseOffset int, th fyne.Theme, v fyne.ThemeVariant, tabWidth int, selLow, selHigh int) widget.TextGridRow {
	var cells []widget.TextGridCell

	for j, r := range line {
		logical := baseOffset + j
		sel := selLow < selHigh && logical >= selLow && logical < selHigh
		k := ClassifyRune(r)
		st := StyleForKind(th, v, k, sel)

		cells = append(cells, widget.TextGridCell{Rune: r, Style: st})

		if r == '\t' {
			col := len(cells)
			next := nextTab(col-1, tabWidth)
			for len(cells) < next {
				padSel := selLow < selHigh && logical >= selLow && logical < selHigh
				ws := StyleForKind(th, v, KindSpace, padSel)
				cells = append(cells, widget.TextGridCell{Rune: ' ', Style: ws})
			}
		}
	}

	return widget.TextGridRow{Cells: cells}
}

// nextTab matches fyne.io/fyne/v2/widget.nextTab for tab stop column.
func nextTab(column int, tabWidth int) int {
	tabStop, _ := math.Modf(float64(column+tabWidth) / float64(tabWidth))
	return tabWidth * int(tabStop)
}
