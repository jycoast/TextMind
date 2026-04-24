package highlight

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// StyleForKind returns a TextGrid cell style for the given kind and selection state.
func StyleForKind(th fyne.Theme, v fyne.ThemeVariant, k Kind, selected bool) *widget.CustomTextGridStyle {
	fg := th.Color(theme.ColorNameForeground, v)
	var bg color.Color = color.Transparent
	if selected {
		bg = th.Color(theme.ColorNameSelection, v)
	}

	switch k {
	case KindSpace:
		return &widget.CustomTextGridStyle{
			FGColor: th.Color(theme.ColorNameDisabled, v),
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	case KindDigit:
		return &widget.CustomTextGridStyle{
			FGColor: th.Color(theme.ColorNamePrimary, v),
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	case KindPunct:
		return &widget.CustomTextGridStyle{
			FGColor: th.Color(theme.ColorNamePlaceHolder, v),
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	case KindHan:
		return &widget.CustomTextGridStyle{
			FGColor: th.Color(theme.ColorNameSuccess, v),
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	case KindLatin:
		return &widget.CustomTextGridStyle{
			FGColor: th.Color(theme.ColorNameWarning, v),
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	default:
		return &widget.CustomTextGridStyle{
			FGColor: fg,
			BGColor: bg,
			TextStyle: fyne.TextStyle{
				Monospace: true,
			},
		}
	}
}
