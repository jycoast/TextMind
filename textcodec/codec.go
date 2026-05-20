// Package textcodec centralizes text encoding detection, decoding, and
// encoding for arbitrary text files opened in the editor.
//
// All in-memory text is UTF-8. Decode converts from on-disk bytes (in any
// supported source encoding) to a UTF-8 string. Encode performs the inverse
// transformation when saving.
package textcodec

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"github.com/saintfish/chardet"
	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

// EncodingID is the stable identifier we use across Go and the frontend.
type EncodingID string

const (
	EncUTF8     EncodingID = "utf-8"
	EncUTF8BOM  EncodingID = "utf-8-bom"
	EncUTF16LE  EncodingID = "utf-16le"
	EncUTF16BE  EncodingID = "utf-16be"
	EncGBK      EncodingID = "gbk"
	EncGB18030  EncodingID = "gb18030"
	EncBig5     EncodingID = "big5"
	EncShiftJIS EncodingID = "shift_jis"
	EncEUCKR    EncodingID = "euc-kr"
	EncISO88591 EncodingID = "iso-8859-1"
)

// EncodingMeta describes one supported encoding for UI display.
type EncodingMeta struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Group string `json:"group"`
}

var encodingOrder = []struct {
	id    EncodingID
	label string
	group string
}{
	{EncUTF8, "UTF-8", "Unicode"},
	{EncUTF8BOM, "UTF-8 with BOM", "Unicode"},
	{EncUTF16LE, "UTF-16 LE", "Unicode"},
	{EncUTF16BE, "UTF-16 BE", "Unicode"},
	{EncGBK, "GBK (简体中文)", "中文"},
	{EncGB18030, "GB18030 (简体中文)", "中文"},
	{EncBig5, "Big5 (繁体中文)", "中文"},
	{EncShiftJIS, "Shift_JIS (日文)", "日文/韩文"},
	{EncEUCKR, "EUC-KR (韩文)", "日文/韩文"},
	{EncISO88591, "ISO-8859-1 (西欧)", "西欧"},
}

// SupportedEncodings returns the ordered list of encodings exposed to UI.
func SupportedEncodings() []EncodingMeta {
	out := make([]EncodingMeta, 0, len(encodingOrder))
	for _, e := range encodingOrder {
		out = append(out, EncodingMeta{
			ID:    string(e.id),
			Label: e.label,
			Group: e.group,
		})
	}
	return out
}

// IsSupported reports whether the encoding id is one we recognize.
func IsSupported(id EncodingID) bool {
	for _, e := range encodingOrder {
		if e.id == id {
			return true
		}
	}
	return false
}

// DetectResult is the outcome of automatic encoding detection.
type DetectResult struct {
	Encoding   EncodingID `json:"encoding"`
	HasBOM     bool       `json:"hasBOM"`
	Confidence int        `json:"confidence"`
}

// Detect inspects raw bytes and returns the best-guess source encoding.
// Order: BOM sniff -> valid UTF-8 -> chardet -> ISO-8859-1 fallback.
func Detect(data []byte) DetectResult {
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		return DetectResult{Encoding: EncUTF8BOM, HasBOM: true, Confidence: 100}
	}
	if len(data) >= 2 && data[0] == 0xFF && data[1] == 0xFE {
		return DetectResult{Encoding: EncUTF16LE, HasBOM: true, Confidence: 100}
	}
	if len(data) >= 2 && data[0] == 0xFE && data[1] == 0xFF {
		return DetectResult{Encoding: EncUTF16BE, HasBOM: true, Confidence: 100}
	}

	if utf8.Valid(data) {
		return DetectResult{Encoding: EncUTF8, HasBOM: false, Confidence: 100}
	}

	detector := chardet.NewTextDetector()
	if best, err := detector.DetectBest(data); err == nil && best != nil {
		if mapped, ok := mapChardetCharset(best.Charset); ok {
			return DetectResult{
				Encoding:   mapped,
				HasBOM:     false,
				Confidence: best.Confidence,
			}
		}
	}

	return DetectResult{Encoding: EncISO88591, HasBOM: false, Confidence: 10}
}

// mapChardetCharset converts a chardet charset name into our EncodingID.
// Returns false when the detected charset is outside the supported set.
func mapChardetCharset(name string) (EncodingID, bool) {
	switch strings.ToUpper(strings.TrimSpace(name)) {
	case "UTF-8":
		return EncUTF8, true
	case "UTF-16LE":
		return EncUTF16LE, true
	case "UTF-16BE":
		return EncUTF16BE, true
	case "UTF-32LE", "UTF-32BE":
		return EncUTF16LE, true
	case "GB-18030", "GB18030", "GB2312", "GBK", "HZ-GB-2312":
		return EncGB18030, true
	case "BIG5":
		return EncBig5, true
	case "SHIFT_JIS", "SHIFT-JIS", "SJIS":
		return EncShiftJIS, true
	case "EUC-JP":
		// Closest in-scope encoding for Japanese.
		return EncShiftJIS, true
	case "EUC-KR":
		return EncEUCKR, true
	case "ISO-8859-1", "WINDOWS-1252":
		return EncISO88591, true
	}
	return "", false
}

// encoder returns the golang.org/x/text encoding for the given id.
// For the synthetic utf-8-bom id, the underlying encoder is plain UTF-8;
// the BOM is handled separately by Decode/Encode.
func resolveEncoding(id EncodingID) (encoding.Encoding, error) {
	switch id {
	case EncUTF8, EncUTF8BOM:
		return unicode.UTF8, nil
	case EncUTF16LE:
		return unicode.UTF16(unicode.LittleEndian, unicode.UseBOM), nil
	case EncUTF16BE:
		return unicode.UTF16(unicode.BigEndian, unicode.UseBOM), nil
	case EncGBK:
		return simplifiedchinese.GBK, nil
	case EncGB18030:
		return simplifiedchinese.GB18030, nil
	case EncBig5:
		return traditionalchinese.Big5, nil
	case EncShiftJIS:
		return japanese.ShiftJIS, nil
	case EncEUCKR:
		return korean.EUCKR, nil
	case EncISO88591:
		return charmap.ISO8859_1, nil
	}
	return nil, fmt.Errorf("不支持的编码: %s", id)
}

// Decode converts disk bytes in the given encoding into a UTF-8 string.
// It also reports whether a BOM was present at the start of the input.
func Decode(data []byte, enc EncodingID) (string, bool, error) {
	hasBOM := false
	switch enc {
	case EncUTF8, EncUTF8BOM:
		if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
			hasBOM = true
			data = data[3:]
		} else if enc == EncUTF8BOM {
			// Caller asked for utf-8-bom but file has none; treat as plain UTF-8.
			hasBOM = false
		}
		if !utf8.Valid(data) {
			return "", hasBOM, fmt.Errorf("文件不是合法的 UTF-8 编码")
		}
		return string(data), hasBOM, nil

	case EncUTF16LE, EncUTF16BE:
		if len(data) >= 2 {
			if data[0] == 0xFF && data[1] == 0xFE {
				hasBOM = true
			} else if data[0] == 0xFE && data[1] == 0xFF {
				hasBOM = true
			}
		}
		dec, err := resolveEncoding(enc)
		if err != nil {
			return "", hasBOM, err
		}
		out, err := transformAll(dec.NewDecoder(), data)
		if err != nil {
			return "", hasBOM, fmt.Errorf("UTF-16 解码失败: %w", err)
		}
		return string(out), hasBOM, nil

	default:
		dec, err := resolveEncoding(enc)
		if err != nil {
			return "", false, err
		}
		out, err := transformAll(dec.NewDecoder(), data)
		if err != nil {
			return "", false, fmt.Errorf("解码失败 (%s): %w", enc, err)
		}
		return string(out), false, nil
	}
}

// Encode converts a UTF-8 string into the bytes representation in the given
// target encoding. When withBOM is true and the encoding supports a BOM,
// a BOM is prepended (UTF-16 BOMs are emitted by golang.org/x/text's UTF-16
// encoder, so we only special-case UTF-8).
func Encode(text string, enc EncodingID, withBOM bool) ([]byte, error) {
	switch enc {
	case EncUTF8, EncUTF8BOM:
		out := []byte(text)
		if withBOM || enc == EncUTF8BOM {
			out = append([]byte{0xEF, 0xBB, 0xBF}, out...)
		}
		return out, nil

	case EncUTF16LE, EncUTF16BE:
		// golang.org/x/text/encoding/unicode UTF16 with UseBOM emits a BOM
		// only when configured with ExpectBOM/IgnoreBOM. We control BOM
		// emission ourselves to honor the caller's withBOM flag.
		bo := unicode.LittleEndian
		if enc == EncUTF16BE {
			bo = unicode.BigEndian
		}
		bomPolicy := unicode.IgnoreBOM
		if withBOM {
			bomPolicy = unicode.UseBOM
		}
		e := unicode.UTF16(bo, bomPolicy)
		out, err := transformAll(e.NewEncoder(), []byte(text))
		if err != nil {
			return nil, fmt.Errorf("UTF-16 编码失败: %w", err)
		}
		return out, nil

	default:
		e, err := resolveEncoding(enc)
		if err != nil {
			return nil, err
		}
		out, err := transformAll(e.NewEncoder(), []byte(text))
		if err != nil {
			return nil, fmt.Errorf("编码失败 (%s): 文本包含目标编码无法表达的字符", enc)
		}
		return out, nil
	}
}

func transformAll(t transform.Transformer, src []byte) ([]byte, error) {
	r := transform.NewReader(bytes.NewReader(src), t)
	return io.ReadAll(r)
}
