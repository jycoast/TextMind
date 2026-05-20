package textcodec

import "testing"

func TestDetectUTF8WithBOM(t *testing.T) {
	data := append([]byte{0xEF, 0xBB, 0xBF}, []byte("hello")...)
	got := Detect(data)
	if got.Encoding != EncUTF8BOM || !got.HasBOM {
		t.Fatalf("expected utf-8-bom with BOM, got %+v", got)
	}
}

func TestDetectUTF16LEWithBOM(t *testing.T) {
	data := []byte{0xFF, 0xFE, 'a', 0x00, 'b', 0x00}
	got := Detect(data)
	if got.Encoding != EncUTF16LE || !got.HasBOM {
		t.Fatalf("expected utf-16le with BOM, got %+v", got)
	}
}

func TestDetectPlainUTF8(t *testing.T) {
	got := Detect([]byte("hello, 世界"))
	if got.Encoding != EncUTF8 || got.HasBOM {
		t.Fatalf("expected utf-8 without BOM, got %+v", got)
	}
}

func TestDecodeUTF8BOM(t *testing.T) {
	data := append([]byte{0xEF, 0xBB, 0xBF}, []byte("abc")...)
	text, hasBOM, err := Decode(data, EncUTF8BOM)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if text != "abc" || !hasBOM {
		t.Fatalf("unexpected result: %q hasBOM=%v", text, hasBOM)
	}
}

func TestEncodeDecodeRoundtripGBK(t *testing.T) {
	text := "你好，世界"
	enc, err := Encode(text, EncGBK, false)
	if err != nil {
		t.Fatalf("encode error: %v", err)
	}
	got, _, err := Decode(enc, EncGBK)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got != text {
		t.Fatalf("roundtrip mismatch: want %q got %q", text, got)
	}
}

func TestEncodeDecodeRoundtripBig5(t *testing.T) {
	text := "繁體中文測試"
	enc, err := Encode(text, EncBig5, false)
	if err != nil {
		t.Fatalf("encode error: %v", err)
	}
	got, _, err := Decode(enc, EncBig5)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got != text {
		t.Fatalf("roundtrip mismatch: want %q got %q", text, got)
	}
}

func TestEncodeDecodeRoundtripShiftJIS(t *testing.T) {
	text := "こんにちは世界"
	enc, err := Encode(text, EncShiftJIS, false)
	if err != nil {
		t.Fatalf("encode error: %v", err)
	}
	got, _, err := Decode(enc, EncShiftJIS)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got != text {
		t.Fatalf("roundtrip mismatch: want %q got %q", text, got)
	}
}

func TestEncodeDecodeRoundtripUTF16LEBOM(t *testing.T) {
	text := "Hello, 世界"
	enc, err := Encode(text, EncUTF16LE, true)
	if err != nil {
		t.Fatalf("encode error: %v", err)
	}
	if len(enc) < 2 || enc[0] != 0xFF || enc[1] != 0xFE {
		t.Fatalf("missing UTF-16 LE BOM: % x", enc[:min(4, len(enc))])
	}
	got, hasBOM, err := Decode(enc, EncUTF16LE)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if got != text || !hasBOM {
		t.Fatalf("roundtrip mismatch: want %q got %q hasBOM=%v", text, got, hasBOM)
	}
}

func TestEncodeUnrepresentable(t *testing.T) {
	if _, err := Encode("中文", EncISO88591, false); err == nil {
		t.Fatalf("expected error when encoding CJK to ISO-8859-1")
	}
}

func TestSupportedEncodings(t *testing.T) {
	list := SupportedEncodings()
	if len(list) < 10 {
		t.Fatalf("expected at least 10 encodings, got %d", len(list))
	}
	seen := map[string]bool{}
	for _, e := range list {
		if seen[e.ID] {
			t.Fatalf("duplicate id %q", e.ID)
		}
		seen[e.ID] = true
		if !IsSupported(EncodingID(e.ID)) {
			t.Fatalf("IsSupported false for listed id %q", e.ID)
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
