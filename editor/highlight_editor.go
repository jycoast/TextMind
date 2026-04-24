package editor

import (
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/widget"
)

// HighlightEditor is a multiline text editor backed by widget.Entry.
//
// Earlier versions used widget.TextGrid for per-rune syntax coloring, but Fyne's
// TextGrid fixes each cell to the pixel width of Latin "M". CJK glyphs are typically
// wider than that cell, so characters drew on top of each other. Entry uses normal
// text layout and correctly renders mixed Chinese / English.
type HighlightEditor struct {
	widget.Entry

	OnSecondaryTap func(*fyne.PointEvent)
	fastSelectAll  bool
	cachedBytes    int
	cachedLines    int
}

const fastSelectAllByteThreshold = 200_000
const fastSelectAllLineThreshold = 4_000

// NewHighlightEditor creates the main editing surface for a tab.
func NewHighlightEditor() *HighlightEditor {
	e := &HighlightEditor{}
	e.MultiLine = true
	// No internal scroll: outer Scroll (see LineNumberEditor) keeps line gutter and text aligned.
	e.Wrapping = fyne.TextWrapOff
	e.Scroll = fyne.ScrollNone
	e.ExtendBaseWidget(e)
	return e
}

// Text returns the full buffer (keeps the same API as older HighlightEditor).
func (e *HighlightEditor) Text() string {
	return e.Entry.Text
}

// SetText keeps fast select-all state in sync with programmatic updates.
func (e *HighlightEditor) SetText(text string) {
	e.fastSelectAll = false
	e.setTextAndCache(text)
}

// SelectedText supports the large-document fast select-all mode.
func (e *HighlightEditor) SelectedText() string {
	if e.fastSelectAll {
		return e.Entry.Text
	}
	return e.Entry.SelectedText()
}

// TypedShortcut intercepts large-document select-all to avoid expensive full highlight rendering.
func (e *HighlightEditor) TypedShortcut(shortcut fyne.Shortcut) {
	switch s := shortcut.(type) {
	case *fyne.ShortcutSelectAll:
		if e.shouldFastSelectAll() {
			if !e.fastSelectAll {
				notifyFastSelectAll()
			}
			e.fastSelectAll = true
			return
		}
		e.fastSelectAll = false
	case *fyne.ShortcutCopy:
		if e.fastSelectAll {
			if cb := resolveClipboard(s.Clipboard); cb != nil {
				cb.SetContent(e.Entry.Text)
			}
			return
		}
	case *fyne.ShortcutCut:
		if e.fastSelectAll {
			if cb := resolveClipboard(s.Clipboard); cb != nil {
				cb.SetContent(e.Entry.Text)
			}
			e.fastSelectAll = false
			e.setTextAndCache("")
			return
		}
	case *fyne.ShortcutPaste:
		if e.fastSelectAll {
			if cb := resolveClipboard(s.Clipboard); cb != nil {
				e.fastSelectAll = false
				e.setTextAndCache(cb.Content())
				return
			}
		}
	}
	e.Entry.TypedShortcut(shortcut)
}

// TypedRune replaces all text when fast select-all is active.
func (e *HighlightEditor) TypedRune(r rune) {
	if e.fastSelectAll {
		e.fastSelectAll = false
		e.setTextAndCache(string(r))
		return
	}
	e.Entry.TypedRune(r)
}

// TypedKey handles delete/replace semantics when fast select-all is active.
func (e *HighlightEditor) TypedKey(key *fyne.KeyEvent) {
	if e.fastSelectAll {
		switch key.Name {
		case fyne.KeyBackspace, fyne.KeyDelete:
			e.fastSelectAll = false
			e.setTextAndCache("")
			return
		case fyne.KeyReturn, fyne.KeyEnter:
			if e.MultiLine {
				e.fastSelectAll = false
				e.setTextAndCache("\n")
				return
			}
		default:
			e.fastSelectAll = false
		}
	}
	e.Entry.TypedKey(key)
}

// MouseDown clears fast select-all once user starts pointer interaction.
func (e *HighlightEditor) MouseDown(m *desktop.MouseEvent) {
	e.fastSelectAll = false
	e.Entry.MouseDown(m)
}

// TappedSecondary runs the app context menu; we take focus like the default Entry does.
func (e *HighlightEditor) TappedSecondary(pe *fyne.PointEvent) {
	if c := fyne.CurrentApp().Driver().CanvasForObject(e); c != nil {
		c.Focus(e)
	}
	e.fastSelectAll = false
	if e.OnSecondaryTap != nil {
		e.OnSecondaryTap(pe)
	}
}

func resolveClipboard(cb fyne.Clipboard) fyne.Clipboard {
	if cb != nil {
		return cb
	}
	if app := fyne.CurrentApp(); app != nil {
		return app.Clipboard()
	}
	return nil
}

func (e *HighlightEditor) shouldFastSelectAll() bool {
	text := e.Entry.Text
	if len(text) >= fastSelectAllByteThreshold {
		return true
	}
	return e.cachedOrComputeLineCount(text) >= fastSelectAllLineThreshold
}

func (e *HighlightEditor) setTextAndCache(text string) {
	e.cachedBytes = len(text)
	e.cachedLines = strings.Count(text, "\n") + 1
	e.Entry.SetText(text)
}

func (e *HighlightEditor) cachedOrComputeLineCount(text string) int {
	if e.cachedLines > 0 && e.cachedBytes == len(text) {
		return e.cachedLines
	}
	e.cachedBytes = len(text)
	e.cachedLines = strings.Count(text, "\n") + 1
	return e.cachedLines
}

func notifyFastSelectAll() {
	app := fyne.CurrentApp()
	if app == nil {
		return
	}
	app.SendNotification(&fyne.Notification{
		Title:   "文本编辑器",
		Content: "大文本已全选（性能模式）",
	})
}
