package persist

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveLoadConversations_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-conversations.json")
	c := Conversations{
		SelectedID: "c1",
		Conversations: []Conversation{
			{
				ID:        "c1",
				Title:     "Hello",
				Model:     "gpt-4o-mini",
				CreatedAt: 100,
				UpdatedAt: 200,
				Messages: []ChatMessage{
					{Role: ChatRoleUser, Content: "hi", CreatedAt: 100},
					{Role: ChatRoleAssistant, Content: "hello!", CreatedAt: 110},
				},
			},
			{
				ID:        "c2",
				Title:     "Other",
				CreatedAt: 50,
				UpdatedAt: 60,
			},
		},
	}
	if err := SaveConversations(path, c); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := LoadConversations(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.SelectedID != "c1" {
		t.Errorf("SelectedID = %q", got.SelectedID)
	}
	if len(got.Conversations) != 2 {
		t.Fatalf("len = %d, want 2", len(got.Conversations))
	}
	if got.Conversations[0].ID != "c1" || got.Conversations[1].ID != "c2" {
		t.Errorf("order changed: %+v", got.Conversations)
	}
	if got.Conversations[0].Messages[1].Content != "hello!" {
		t.Errorf("message content lost: %+v", got.Conversations[0].Messages)
	}
}

func TestLoadConversations_MissingFile(t *testing.T) {
	dir := t.TempDir()
	got, err := LoadConversations(filepath.Join(dir, "nope.json"))
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(got.Conversations) != 0 || got.SelectedID != "" {
		t.Errorf("expected zero, got %+v", got)
	}
}

func TestLoadConversations_StaleSelectedID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-conversations.json")
	if err := SaveConversations(path, Conversations{
		SelectedID:    "ghost",
		Conversations: []Conversation{{ID: "real", UpdatedAt: 1}},
	}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := LoadConversations(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got.SelectedID != "" {
		t.Errorf("stale SelectedID not cleared: %q", got.SelectedID)
	}
}

func TestTruncateConversations(t *testing.T) {
	const cap = 5
	c := Conversations{SelectedID: "id-3"}
	for i := 0; i < cap*2; i++ {
		c.Conversations = append(c.Conversations, Conversation{
			ID:        fmt.Sprintf("id-%d", i),
			UpdatedAt: int64(i),
		})
	}
	got := TruncateConversations(c, cap)
	if len(got.Conversations) != cap {
		t.Fatalf("len = %d, want %d", len(got.Conversations), cap)
	}
	// Should keep the highest UpdatedAt entries (i = 5..9).
	for _, conv := range got.Conversations {
		if conv.UpdatedAt < int64(cap) {
			t.Errorf("kept stale entry %+v", conv)
		}
	}
	// SelectedID id-3 (UpdatedAt=3) was dropped; should clear.
	if got.SelectedID != "" {
		t.Errorf("expected SelectedID cleared, got %q", got.SelectedID)
	}
}

func TestSaveConversations_AppliesTruncation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-conversations.json")
	c := Conversations{}
	for i := 0; i < MaxConversations+50; i++ {
		c.Conversations = append(c.Conversations, Conversation{
			ID:        fmt.Sprintf("id-%d", i),
			UpdatedAt: int64(i),
		})
	}
	if err := SaveConversations(path, c); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := LoadConversations(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(got.Conversations) != MaxConversations {
		t.Errorf("len = %d, want %d", len(got.Conversations), MaxConversations)
	}
}

func TestSaveConversations_AtomicTmp(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ai-conversations.json")
	if err := SaveConversations(path, Conversations{
		Conversations: []Conversation{{ID: "x", UpdatedAt: 1}},
	}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	// .tmp must have been renamed away.
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf(".tmp still exists or unexpected stat: %v", err)
	}
}

func TestSummarizeTitle(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", "新对话"},
		{"   ", "新对话"},
		{"hello", "hello"},
		{"\n\n  trimmed line  \nsecond", "trimmed line"},
		{strings.Repeat("a", 50), strings.Repeat("a", 30) + "…"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got := SummarizeTitle(tc.in)
			if got != tc.want {
				t.Errorf("SummarizeTitle(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
