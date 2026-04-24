package highlight

import "unicode"

// Kind classifies a rune for syntax-style coloring.
type Kind int

const (
	KindSpace Kind = iota
	KindDigit
	KindPunct
	KindHan
	KindLatin
	KindOther
)

// ClassifyRune assigns a Kind to a single rune (CJK / Latin / digits / punctuation / space / other).
func ClassifyRune(r rune) Kind {
	if unicode.IsSpace(r) {
		return KindSpace
	}
	if unicode.IsDigit(r) {
		return KindDigit
	}
	if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
		return KindHan
	}
	if unicode.IsLetter(r) {
		return KindLatin
	}
	if unicode.IsPunct(r) || unicode.IsSymbol(r) {
		return KindPunct
	}
	return KindOther
}
