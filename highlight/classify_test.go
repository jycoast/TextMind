package highlight

import "testing"

func TestClassifyRune(t *testing.T) {
	tests := []struct {
		r    rune
		want Kind
	}{
		{' ', KindSpace},
		{'\t', KindSpace},
		{'0', KindDigit},
		{'9', KindDigit},
		{',', KindPunct},
		{'.', KindPunct},
		{'你', KindHan},
		{'a', KindLatin},
		{'Z', KindLatin},
		{'_', KindPunct},
	}
	for _, tt := range tests {
		if got := ClassifyRune(tt.r); got != tt.want {
			t.Errorf("ClassifyRune(%q) = %v, want %v", tt.r, got, tt.want)
		}
	}
}
