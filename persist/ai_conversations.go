package persist

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// MaxConversations is the upper bound on persisted conversations. Older
// entries (lowest UpdatedAt) are dropped when the limit is exceeded.
const MaxConversations = 200

// ChatRole is the message author. We keep it as a string to preserve forward
// compatibility with provider-specific roles.
type ChatRole = string

const (
	ChatRoleSystem    ChatRole = "system"
	ChatRoleUser      ChatRole = "user"
	ChatRoleAssistant ChatRole = "assistant"
)

// ChatMessage is one persisted message inside a conversation.
type ChatMessage struct {
	Role      ChatRole `json:"role"`
	Content   string   `json:"content"`
	CreatedAt int64    `json:"created_at,omitempty"`
}

// Conversation is a single chat thread.
type Conversation struct {
	ID        string        `json:"id"`
	Title     string        `json:"title"`
	Model     string        `json:"model,omitempty"`
	CreatedAt int64         `json:"created_at"`
	UpdatedAt int64         `json:"updated_at"`
	Messages  []ChatMessage `json:"messages,omitempty"`
}

// Conversations is the persisted on-disk shape: the full list plus the
// currently-selected conversation id (so reopening the app restores focus).
type Conversations struct {
	Conversations []Conversation `json:"conversations,omitempty"`
	SelectedID    string         `json:"selected_id,omitempty"`
}

// AIConversationsPath returns the on-disk path for the conversations file.
func AIConversationsPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tinyEditor", "ai-conversations.json"), nil
}

// LoadConversations reads conversations from path. Missing or invalid file
// returns a zero value with a nil error.
func LoadConversations(path string) (Conversations, error) {
	if path == "" {
		return Conversations{}, errors.New("persist: empty conversations path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Conversations{}, nil
		}
		return Conversations{}, err
	}
	var c Conversations
	if err := json.Unmarshal(data, &c); err != nil {
		return Conversations{}, nil
	}
	// Validate selected id still exists; otherwise clear it.
	if c.SelectedID != "" {
		found := false
		for _, conv := range c.Conversations {
			if conv.ID == c.SelectedID {
				found = true
				break
			}
		}
		if !found {
			c.SelectedID = ""
		}
	}
	return c, nil
}

// SaveConversations writes conversations atomically. It enforces the
// MaxConversations cap by dropping the least-recently-updated entries.
func SaveConversations(path string, c Conversations) error {
	if path == "" {
		return errors.New("persist: empty conversations path")
	}
	c = TruncateConversations(c, MaxConversations)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// TruncateConversations enforces the cap and normalises trivial inconsistencies
// (e.g. nil messages slice). It is exported for unit tests; callers should
// prefer SaveConversations which calls this internally.
func TruncateConversations(c Conversations, max int) Conversations {
	if max <= 0 {
		max = MaxConversations
	}
	if len(c.Conversations) <= max {
		return c
	}
	// Sort by UpdatedAt desc, then keep top `max`.
	sorted := make([]Conversation, len(c.Conversations))
	copy(sorted, c.Conversations)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].UpdatedAt > sorted[j].UpdatedAt
	})
	c.Conversations = sorted[:max]
	if c.SelectedID != "" && !containsID(c.Conversations, c.SelectedID) {
		c.SelectedID = ""
	}
	return c
}

func containsID(list []Conversation, id string) bool {
	for _, conv := range list {
		if conv.ID == id {
			return true
		}
	}
	return false
}

// SummarizeTitle produces a short one-line title from the first user message.
// Useful for auto-naming new conversations.
func SummarizeTitle(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "新对话"
	}
	// First non-empty line, truncated.
	for _, line := range strings.Split(s, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		runes := []rune(t)
		const max = 30
		if len(runes) > max {
			return string(runes[:max]) + "…"
		}
		return t
	}
	return "新对话"
}
