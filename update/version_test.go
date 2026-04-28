package update

import "testing"

func TestCompareReleaseOrdering(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"v1.0.0", "v1.0.0", 0},
		{"v1.0.0", "v1.0.1", -1},
		{"v1.0.1", "v1.0.0", +1},
		{"v1.2.3", "v1.10.0", -1},
		{"v2.0.0", "v1.999.999", +1},
		{"1.0", "1.0.0", 0},
		{"v1.0", "v1.0.1", -1},
		{"v0.0.1", "v1.0.0", -1},
		// "v" prefix optional
		{"1.0.0", "v1.0.0", 0},
	}
	for _, tc := range cases {
		got := Compare(tc.a, tc.b)
		if got != tc.want {
			t.Errorf("Compare(%q,%q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestComparePrerelease(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"v1.0.0-rc.1", "v1.0.0", -1},
		{"v1.0.0", "v1.0.0-rc.1", +1},
		{"v1.0.0-rc.1", "v1.0.0-rc.2", -1},
		{"v1.0.0-rc.10", "v1.0.0-rc.2", +1}, // numeric compare, not lex
		{"v1.0.0-alpha", "v1.0.0-beta", -1},
		{"v1.0.0-rc.1", "v1.0.0-rc.1", 0},
		// numeric < non-numeric per semver §11.4.3
		{"v1.0.0-1", "v1.0.0-alpha", -1},
		// build metadata (after +) ignored
		{"v1.0.0+build1", "v1.0.0+build9", 0},
	}
	for _, tc := range cases {
		got := Compare(tc.a, tc.b)
		if got != tc.want {
			t.Errorf("Compare(%q,%q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestCompareUnparseable(t *testing.T) {
	// Any unparseable input is treated as older than any parseable one,
	// so a `dev` build always sees a real release as newer.
	if Compare("dev", "v1.0.0") != -1 {
		t.Error("dev should be older than v1.0.0")
	}
	if Compare("v0.0.1", "dev") != +1 {
		t.Error("v0.0.1 should be newer than dev")
	}
	if Compare("", "v1.0.0") != -1 {
		t.Error("empty should be older than v1.0.0")
	}
	// Two unparseable versions fall back to lex compare on the originals.
	if Compare("dev-a", "dev-b") >= 0 {
		t.Error("dev-a should sort before dev-b")
	}
}

func TestIsNewer(t *testing.T) {
	if !IsNewer("v1.0.0", "v1.0.1") {
		t.Error("v1.0.1 should be newer than v1.0.0")
	}
	if IsNewer("v1.0.0", "v1.0.0") {
		t.Error("same version should not be newer")
	}
	if IsNewer("v1.0.1", "v1.0.0") {
		t.Error("older version should not be newer")
	}
	if !IsNewer("dev", "v0.0.1") {
		t.Error("dev should treat v0.0.1 as newer (force update path)")
	}
}
