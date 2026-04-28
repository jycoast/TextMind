// Package update implements TextMind's self-update flow:
//
//   - Compare the running build's version against the latest GitHub release.
//   - Download the release asset for the current platform.
//   - Hand off to a small platform-specific installer that swaps the
//     executable and relaunches the app.
//
// The package is deliberately dependency-free; it only uses the standard
// library so it stays trivial to audit when handling executables.
package update

import (
	"strconv"
	"strings"
)

// Compare returns -1 / 0 / +1 if a is older / same / newer than b.
//
// The accepted shape is `[v]MAJOR.MINOR.PATCH[-prerelease]`, matching the
// tag scheme used by the release workflow (e.g. "v1.2.3", "v1.2.3-rc.1").
// Pre-release versions are ALWAYS considered older than their release
// counterpart (semver §11). Numeric identifiers are compared numerically;
// non-numeric ones lexicographically.
//
// Inputs that fail to parse (empty string, "dev", garbage) are treated as
// pre-historic. This keeps the "running unstable build" case sensible: a
// developer running `wails dev` will always see the latest release as
// strictly newer.
func Compare(a, b string) int {
	pa := parse(a)
	pb := parse(b)
	return compareParsed(pa, pb)
}

type parsed struct {
	parts    []string // major / minor / patch / ...
	pre      string   // pre-release suffix, "" means release
	original string
	parsed   bool // false if input was unparseable
}

func parse(v string) parsed {
	t := strings.TrimSpace(v)
	out := parsed{original: t}
	if t == "" {
		return out
	}
	t = strings.TrimPrefix(t, "v")
	t = strings.TrimPrefix(t, "V")

	pre := ""
	if i := strings.IndexAny(t, "-+"); i >= 0 {
		// "+" is build metadata per semver and ignored entirely.
		if t[i] == '-' {
			pre = t[i+1:]
		}
		t = t[:i]
	}

	parts := strings.Split(t, ".")
	if len(parts) == 0 {
		return out
	}
	for _, p := range parts {
		if p == "" {
			return out
		}
		// Each main component must be numeric.
		if _, err := strconv.ParseUint(p, 10, 64); err != nil {
			return out
		}
	}
	out.parts = parts
	out.pre = pre
	out.parsed = true
	return out
}

func compareParsed(a, b parsed) int {
	switch {
	case !a.parsed && !b.parsed:
		return strings.Compare(a.original, b.original)
	case !a.parsed:
		return -1
	case !b.parsed:
		return +1
	}

	maxLen := len(a.parts)
	if len(b.parts) > maxLen {
		maxLen = len(b.parts)
	}
	for i := 0; i < maxLen; i++ {
		av := getPart(a.parts, i)
		bv := getPart(b.parts, i)
		if av != bv {
			if av < bv {
				return -1
			}
			return +1
		}
	}

	// Same numeric core. Pre-release < release.
	switch {
	case a.pre == "" && b.pre == "":
		return 0
	case a.pre == "":
		return +1
	case b.pre == "":
		return -1
	}
	return comparePreRelease(a.pre, b.pre)
}

func getPart(parts []string, i int) uint64 {
	if i >= len(parts) {
		return 0
	}
	v, _ := strconv.ParseUint(parts[i], 10, 64)
	return v
}

// comparePreRelease implements semver §11.4 lexicographic identifier
// compare on the pre-release suffix.
func comparePreRelease(a, b string) int {
	as := strings.Split(a, ".")
	bs := strings.Split(b, ".")
	n := len(as)
	if len(bs) > n {
		n = len(bs)
	}
	for i := 0; i < n; i++ {
		var ai, bi string
		if i < len(as) {
			ai = as[i]
		}
		if i < len(bs) {
			bi = bs[i]
		}
		// Missing identifier means "shorter wins".
		if ai == "" {
			return -1
		}
		if bi == "" {
			return +1
		}
		anum, aerr := strconv.ParseUint(ai, 10, 64)
		bnum, berr := strconv.ParseUint(bi, 10, 64)
		switch {
		case aerr == nil && berr == nil:
			if anum != bnum {
				if anum < bnum {
					return -1
				}
				return +1
			}
		case aerr == nil:
			return -1 // numeric < non-numeric
		case berr == nil:
			return +1
		default:
			if c := strings.Compare(ai, bi); c != 0 {
				return c
			}
		}
	}
	return 0
}

// IsNewer reports whether `latest` is strictly newer than `current`.
func IsNewer(current, latest string) bool {
	return Compare(current, latest) < 0
}
