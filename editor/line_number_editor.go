package editor

import (
	"image/color"
	"math"
	"strconv"
	"strings"

	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// LineNumberEditor shows a left gutter with 1-based line numbers.
// The gutter is self-drawn and only renders visible lines for performance.
type LineNumberEditor struct {
	*container.Scroll
	Editor *HighlightEditor

	gutter     *lineNumberWidget
	totalLines int
	lineStep   float32
	topInset   float32
	contentH   float32
}

// NewLineNumberEditor creates a scrollable editor with a line number column on the left.
func NewLineNumberEditor() *LineNumberEditor {
	ed := NewHighlightEditor()
	lineStep, topInset := measureEntryMetrics()
	gutter := newLineNumberWidget()

	row := container.NewBorder(nil, nil, gutter, nil, ed)
	scroll := container.NewScroll(row)
	le := &LineNumberEditor{
		Scroll:     scroll,
		Editor:     ed,
		gutter:     gutter,
		totalLines: 1,
		lineStep:   lineStep,
		topInset:   topInset,
		contentH:   topInset*2 + lineStep,
	}

	ed.OnChanged = func(string) {
		le.totalLines = lineCount(ed.Text())
		le.contentH = le.topInset*2 + le.lineStep*float32(le.totalLines)
		le.refreshGutter()
	}
	scroll.OnScrolled = func(fyne.Position) {
		le.refreshGutter()
	}

	le.refreshGutter()
	return le
}

func (e *LineNumberEditor) refreshGutter() {
	if e.gutter == nil || e.Scroll == nil || e.Editor == nil {
		return
	}
	if e.totalLines < 1 {
		e.totalLines = 1
	}
	if e.lineStep <= 0 {
		e.lineStep = theme.TextSize() + theme.LineSpacing()
		if e.lineStep <= 0 {
			e.lineStep = 16
		}
	}

	viewportH := e.Scroll.Size().Height
	// During initial window layout, scroll viewport height can be 0 or very small.
	// Use a sensible fallback so first paint already covers a full visible page.
	if viewportH < e.lineStep*4 {
		viewportH = e.lineStep * 80
	}

	e.gutter.SetViewport(
		e.totalLines,
		e.lineStep,
		e.topInset,
		e.contentH,
		e.Scroll.Offset.Y,
		viewportH,
	)
}

func lineCount(text string) int {
	return strings.Count(text, "\n") + 1
}

func measureEntryMetrics() (lineStep, topInset float32) {
	m := NewHighlightEditor()
	m.SetText("1")
	h1 := m.MinSize().Height

	m.SetText("1\n2")
	h2 := m.MinSize().Height

	lineStep = h2 - h1
	if lineStep <= 0 {
		lineStep = theme.TextSize() + theme.LineSpacing()
	}
	topInset = (h1 - lineStep) / 2
	if topInset < 0 {
		topInset = 0
	}
	return lineStep, topInset
}

type lineNumberWidget struct {
	widget.BaseWidget

	totalLines int
	lineStep   float32
	topInset   float32
	contentH   float32

	offsetY   float32
	viewportH float32

	digits      int
	digitWidth  float32
	minWidth    float32
	renderStart int
	renderEnd   int

	disabledCol color.Color
	textPool    []*canvas.Text
	objects     []fyne.CanvasObject
}

func newLineNumberWidget() *lineNumberWidget {
	w := &lineNumberWidget{
		lineStep:   theme.TextSize() + theme.LineSpacing(),
		totalLines: 1,
		digits:     1,
		disabledCol: disabledTextColor(),
	}
	w.recomputeDigitMetrics()
	w.ExtendBaseWidget(w)
	return w
}

func (w *lineNumberWidget) recomputeDigitMetrics() {
	w.digitWidth = fyne.MeasureText(strings.Repeat("0", w.digits), theme.TextSize(), fyne.TextStyle{Monospace: true}).Width
	w.minWidth = w.digitWidth + theme.Padding()*2
}

func (w *lineNumberWidget) SetViewport(totalLines int, lineStep, topInset, contentH, offsetY, viewportH float32) {
	if totalLines < 1 {
		totalLines = 1
	}
	w.totalLines = totalLines
	w.lineStep = lineStep
	w.topInset = topInset
	w.contentH = contentH
	w.offsetY = offsetY
	w.viewportH = viewportH

	newDigits := len(strconv.Itoa(totalLines))
	dirty := false
	if newDigits != w.digits {
		w.digits = newDigits
		w.recomputeDigitMetrics()
		dirty = true
	}

	firstVisible := 1
	if w.offsetY > w.topInset {
		firstVisible = int(math.Floor(float64((w.offsetY-w.topInset)/w.lineStep))) + 1
	}
	if firstVisible < 1 {
		firstVisible = 1
	}
	if firstVisible > w.totalLines {
		firstVisible = w.totalLines
	}

	visibleCount := int(math.Ceil(float64(w.viewportH/w.lineStep))) + 2
	if visibleCount < 1 {
		visibleCount = 1
	}
	start := firstVisible - 4
	if start < 1 {
		start = 1
	}
	end := firstVisible + visibleCount + 4
	if end > w.totalLines {
		end = w.totalLines
	}
	minEnd := firstVisible + visibleCount - 1
	if minEnd > w.totalLines {
		minEnd = w.totalLines
	}
	if end < minEnd {
		end = minEnd
	}

	if !dirty && w.renderStart == start && w.renderEnd == end {
		return
	}
	w.renderStart = start
	w.renderEnd = end
	w.Refresh()
}

func (w *lineNumberWidget) CreateRenderer() fyne.WidgetRenderer {
	r := &lineNumberRenderer{w: w}
	r.Refresh()
	return r
}

type lineNumberRenderer struct {
	w       *lineNumberWidget
	objects []fyne.CanvasObject
}

func (r *lineNumberRenderer) Destroy() {}

func (r *lineNumberRenderer) Layout(_ fyne.Size) {
	r.positionAndPopulate()
}

func (r *lineNumberRenderer) MinSize() fyne.Size {
	return fyne.NewSize(r.w.minWidth, r.w.contentH)
}

func (r *lineNumberRenderer) Objects() []fyne.CanvasObject {
	return r.objects
}

func (r *lineNumberRenderer) Refresh() {
	r.positionAndPopulate()
}

func (r *lineNumberRenderer) positionAndPopulate() {
	w := r.w
	if w.lineStep <= 0 {
		w.lineStep = theme.TextSize() + theme.LineSpacing()
	}
	if w.contentH <= 0 {
		w.contentH = w.lineStep + w.topInset*2
	}

	if w.disabledCol == nil {
		w.disabledCol = disabledTextColor()
	}

	if w.renderStart < 1 {
		w.renderStart = 1
	}
	if w.renderEnd < w.renderStart {
		w.renderEnd = w.renderStart
	}
	need := w.renderEnd - w.renderStart + 1
	for len(w.textPool) < need {
		t := canvas.NewText("", w.disabledCol)
		t.TextStyle = fyne.TextStyle{Monospace: true}
		t.TextSize = theme.TextSize()
		w.textPool = append(w.textPool, t)
		w.objects = append(w.objects, t)
	}

	for i := 0; i < need; i++ {
		line := w.renderStart + i
		t := w.textPool[i]
		newText := leftPadInt(line, w.digits)
		changed := false
		if t.Text != newText {
			t.Text = newText
			changed = true
		}
		if t.Color != w.disabledCol {
			t.Color = w.disabledCol
			changed = true
		}
		y := w.topInset + float32(line-1)*w.lineStep
		x := w.minWidth - w.digitWidth - theme.Padding()
		if x < 0 {
			x = 0
		}
		t.Move(fyne.NewPos(x, y))
		t.Show()
		if changed {
			t.Refresh()
		}
	}
	for i := need; i < len(w.textPool); i++ {
		if w.textPool[i].Visible() {
			w.textPool[i].Hide()
		}
	}
	r.objects = w.objects
}

func disabledTextColor() color.Color {
	app := fyne.CurrentApp()
	if app == nil {
		return color.NRGBA{R: 130, G: 130, B: 130, A: 255}
	}
	th := app.Settings().Theme()
	v := app.Settings().ThemeVariant()
	return th.Color(theme.ColorNameDisabled, v)
}

func leftPadInt(v, width int) string {
	s := strconv.Itoa(v)
	if len(s) >= width {
		return s
	}
	return strings.Repeat(" ", width-len(s)) + s
}
