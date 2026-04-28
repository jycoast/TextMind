package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"tinyEditor/ai"
	"tinyEditor/persist"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---- DTOs (frontend-facing camelCase) ----

// AIConfigDTO is the wails-bound shape of the AI configuration.
type AIConfigDTO struct {
	BaseURL      string   `json:"baseUrl"`
	APIKey       string   `json:"apiKey"`
	DefaultModel string   `json:"defaultModel"`
	Models       []string `json:"models"`
	SystemPrompt string   `json:"systemPrompt"`
}

// ChatMessageDTO is one message exchanged with the frontend.
type ChatMessageDTO struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"createdAt,omitempty"`
}

// ConversationMetaDTO summarises a conversation for list views.
type ConversationMetaDTO struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Model     string `json:"model,omitempty"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// ConversationDTO carries the full conversation including messages.
type ConversationDTO struct {
	ID        string           `json:"id"`
	Title     string           `json:"title"`
	Model     string           `json:"model,omitempty"`
	CreatedAt int64            `json:"createdAt"`
	UpdatedAt int64            `json:"updatedAt"`
	Messages  []ChatMessageDTO `json:"messages"`
}

// ConversationListDTO is the response shape of ListConversations.
type ConversationListDTO struct {
	Conversations []ConversationMetaDTO `json:"conversations"`
	SelectedID    string                `json:"selectedId"`
}

// StartChatRequest carries everything needed to start one streaming chat call.
//
// Conventions:
//   - Messages is the exact array sent to the OpenAI-compatible endpoint
//     (system + history + new user). The frontend is responsible for
//     building it.
//   - If ConversationID is non-empty AND UserMessage is non-empty, the user
//     message is appended to that conversation before streaming starts. On
//     normal completion, the assistant reply is appended too.
//   - Model falls back to the saved AIConfig.DefaultModel when empty.
type StartChatRequest struct {
	Messages       []ChatMessageDTO `json:"messages"`
	ConversationID string           `json:"conversationId,omitempty"`
	UserMessage    string           `json:"userMessage,omitempty"`
	Model          string           `json:"model,omitempty"`
}

// StartChatResult is the synchronous return value of StartChatStream.
//
// On success, StreamID identifies the running stream; the actual content is
// delivered asynchronously via runtime events:
//
//	ai:stream:<id>:chunk -> { delta: string }
//	ai:stream:<id>:done  -> { finishReason: string, content: string }
//	ai:stream:<id>:error -> { error: string }
type StartChatResult struct {
	StreamID string `json:"streamId,omitempty"`
	Error    string `json:"error,omitempty"`
}

// SimpleResult is a generic "ok / error" return shape for void-ish calls.
type SimpleResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// AIModelDTO is one entry returned by FetchAIModels.
type AIModelDTO struct {
	ID      string `json:"id"`
	OwnedBy string `json:"ownedBy,omitempty"`
	Created int64  `json:"created,omitempty"`
}

// FetchModelsResult is the response shape of FetchAIModels.
type FetchModelsResult struct {
	OK     bool         `json:"ok"`
	Error  string       `json:"error,omitempty"`
	Models []AIModelDTO `json:"models"`
}

// ---- streamRegistry ----

// streamRegistry tracks active streaming completions so they can be cancelled.
type streamRegistry struct {
	mu sync.Mutex
	m  map[string]context.CancelFunc
}

func (r *streamRegistry) add(id string, cancel context.CancelFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.m == nil {
		r.m = map[string]context.CancelFunc{}
	}
	r.m[id] = cancel
}

func (r *streamRegistry) remove(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.m, id)
}

func (r *streamRegistry) cancel(id string) {
	r.mu.Lock()
	cancel, ok := r.m[id]
	delete(r.m, id)
	r.mu.Unlock()
	if ok {
		cancel()
	}
}

func (r *streamRegistry) cancelAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, cancel := range r.m {
		cancel()
		delete(r.m, id)
	}
}

// ---- helpers ----

// newRandomID returns a hex-encoded random id (24 chars).
func newRandomID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// extremely unlikely; fall back to a time-based id so we never produce
		// an empty string.
		now := time.Now().UnixNano()
		return hexUint64(uint64(now))
	}
	return hex.EncodeToString(b[:])
}

func hexUint64(v uint64) string {
	const digits = "0123456789abcdef"
	var b [16]byte
	for i := 15; i >= 0; i-- {
		b[i] = digits[v&0xF]
		v >>= 4
	}
	return string(b[:])
}

func nowUnix() int64 { return time.Now().Unix() }

// toDTOConfig converts persist.AIConfig -> AIConfigDTO.
func toDTOConfig(cfg persist.AIConfig) AIConfigDTO {
	models := cfg.Models
	if models == nil {
		models = []string{}
	}
	return AIConfigDTO{
		BaseURL:      cfg.BaseURL,
		APIKey:       cfg.APIKey,
		DefaultModel: cfg.DefaultModel,
		Models:       models,
		SystemPrompt: cfg.SystemPrompt,
	}
}

func fromDTOConfig(dto AIConfigDTO) persist.AIConfig {
	return persist.AIConfig{
		BaseURL:      strings.TrimSpace(dto.BaseURL),
		APIKey:       strings.TrimSpace(dto.APIKey),
		DefaultModel: strings.TrimSpace(dto.DefaultModel),
		Models:       sanitizeStringSlice(dto.Models),
		SystemPrompt: dto.SystemPrompt,
	}
}

func sanitizeStringSlice(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := make([]string, 0, len(in))
	seen := map[string]struct{}{}
	for _, s := range in {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func toDTOMessage(m persist.ChatMessage) ChatMessageDTO {
	return ChatMessageDTO{Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt}
}

func toDTOMessages(in []persist.ChatMessage) []ChatMessageDTO {
	out := make([]ChatMessageDTO, 0, len(in))
	for _, m := range in {
		out = append(out, toDTOMessage(m))
	}
	return out
}

func toDTOConversationMeta(c persist.Conversation) ConversationMetaDTO {
	return ConversationMetaDTO{
		ID:        c.ID,
		Title:     c.Title,
		Model:     c.Model,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}
}

func toDTOConversation(c persist.Conversation) ConversationDTO {
	return ConversationDTO{
		ID:        c.ID,
		Title:     c.Title,
		Model:     c.Model,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
		Messages:  toDTOMessages(c.Messages),
	}
}

// ---- thread-safe persist helpers ----
//
// All conversation reads/writes go through these so concurrent stream finishes
// don't trample each other. The lock is also held during Read-Modify-Write
// transitions (e.g. append a message).

func (a *App) loadConversationsLocked() (persist.Conversations, error) {
	return persist.LoadConversations(a.aiConvPath)
}

func (a *App) saveConversationsLocked(c persist.Conversations) error {
	return persist.SaveConversations(a.aiConvPath, c)
}

// findConvIndex returns the index of id in list, or -1.
func findConvIndex(list []persist.Conversation, id string) int {
	for i := range list {
		if list[i].ID == id {
			return i
		}
	}
	return -1
}

// ---- AI config methods ----

// GetAIConfig returns the persisted AI configuration. A first-run user gets a
// zeroed-out object with sensible defaults filled in by the frontend.
func (a *App) GetAIConfig() AIConfigDTO {
	cfg, err := persist.LoadAIConfig(a.aiConfigPath)
	if err != nil {
		a.logger.Printf("ai: load config: %v", err)
	}
	return toDTOConfig(cfg)
}

// SaveAIConfig persists the AI configuration with mode 0600.
func (a *App) SaveAIConfig(dto AIConfigDTO) SimpleResult {
	if err := persist.SaveAIConfig(a.aiConfigPath, fromDTOConfig(dto)); err != nil {
		a.logger.Printf("ai: save config: %v", err)
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// FetchAIModels calls GET {baseUrl}/models against the supplied configuration
// and returns the (sorted, de-duplicated) list of model identifiers exposed
// by the provider. The configuration is NOT persisted; the frontend may use
// the result to populate or augment the user's model list.
//
// BaseURL is required; APIKey is sent as a Bearer token when present (a few
// providers, like local Ollama, do not need one).
func (a *App) FetchAIModels(dto AIConfigDTO) FetchModelsResult {
	cfg := fromDTOConfig(dto)
	if cfg.BaseURL == "" {
		return FetchModelsResult{Error: "Base URL is empty", Models: []AIModelDTO{}}
	}
	client := ai.NewClient(cfg.BaseURL, cfg.APIKey)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	models, err := client.ListModels(ctx)
	if err != nil {
		return FetchModelsResult{Error: err.Error(), Models: []AIModelDTO{}}
	}
	out := make([]AIModelDTO, 0, len(models))
	for _, m := range models {
		out = append(out, AIModelDTO{
			ID:      m.ID,
			OwnedBy: m.OwnedBy,
			Created: m.Created,
		})
	}
	return FetchModelsResult{OK: true, Models: out}
}

// TestAIConnection performs a minimal non-streaming chat call against the
// supplied configuration. It does NOT save the configuration; that is up to
// the frontend. The default model is used.
func (a *App) TestAIConnection(dto AIConfigDTO) SimpleResult {
	cfg := fromDTOConfig(dto)
	if cfg.BaseURL == "" {
		return SimpleResult{Error: "Base URL is empty"}
	}
	if cfg.DefaultModel == "" {
		return SimpleResult{Error: "default model is empty"}
	}
	client := ai.NewClient(cfg.BaseURL, cfg.APIKey)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := client.Ping(ctx, cfg.DefaultModel); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// ---- conversation CRUD ----

// ListConversations returns all conversations sorted by UpdatedAt desc. Heavy
// `messages` payloads are stripped; the frontend should call GetConversation
// to load the full thread on demand.
func (a *App) ListConversations() ConversationListDTO {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		a.logger.Printf("ai: list conversations: %v", err)
		return ConversationListDTO{Conversations: []ConversationMetaDTO{}}
	}
	out := make([]ConversationMetaDTO, 0, len(c.Conversations))
	for _, conv := range c.Conversations {
		out = append(out, toDTOConversationMeta(conv))
	}
	// Newest first.
	sortConversationsDesc(out)
	return ConversationListDTO{Conversations: out, SelectedID: c.SelectedID}
}

// GetConversation returns one full conversation by id.
func (a *App) GetConversation(id string) ConversationDTO {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		a.logger.Printf("ai: get conversation: %v", err)
		return ConversationDTO{Messages: []ChatMessageDTO{}}
	}
	idx := findConvIndex(c.Conversations, id)
	if idx < 0 {
		return ConversationDTO{Messages: []ChatMessageDTO{}}
	}
	return toDTOConversation(c.Conversations[idx])
}

// CreateConversation appends a new empty conversation, persists, and returns
// the freshly-created entry. The new id becomes SelectedID.
func (a *App) CreateConversation(title, model string) ConversationDTO {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		a.logger.Printf("ai: create conversation load: %v", err)
	}

	now := nowUnix()
	id := newRandomID()
	conv := persist.Conversation{
		ID:        id,
		Title:     strings.TrimSpace(title),
		Model:     strings.TrimSpace(model),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if conv.Title == "" {
		conv.Title = "新对话"
	}
	c.Conversations = append([]persist.Conversation{conv}, c.Conversations...)
	c.SelectedID = id
	if err := a.saveConversationsLocked(c); err != nil {
		a.logger.Printf("ai: create conversation save: %v", err)
	}
	return toDTOConversation(conv)
}

// RenameConversation updates the title; trimming and a 100-char cap is applied.
func (a *App) RenameConversation(id, title string) SimpleResult {
	id = strings.TrimSpace(id)
	if id == "" {
		return SimpleResult{Error: "id is empty"}
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "新对话"
	}
	if r := []rune(title); len(r) > 100 {
		title = string(r[:100])
	}

	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	idx := findConvIndex(c.Conversations, id)
	if idx < 0 {
		return SimpleResult{Error: "conversation not found"}
	}
	c.Conversations[idx].Title = title
	c.Conversations[idx].UpdatedAt = nowUnix()
	if err := a.saveConversationsLocked(c); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// DeleteConversation removes a conversation; if it was selected, SelectedID is
// cleared.
func (a *App) DeleteConversation(id string) SimpleResult {
	id = strings.TrimSpace(id)
	if id == "" {
		return SimpleResult{Error: "id is empty"}
	}

	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	idx := findConvIndex(c.Conversations, id)
	if idx < 0 {
		return SimpleResult{Error: "conversation not found"}
	}
	c.Conversations = append(c.Conversations[:idx], c.Conversations[idx+1:]...)
	if c.SelectedID == id {
		c.SelectedID = ""
	}
	if err := a.saveConversationsLocked(c); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// SetConversationModel updates the model pinned to a conversation. Pass an
// empty string to clear it (subsequent sends will fall back to the default
// model). UpdatedAt is bumped so the conversation moves to the top of the
// list.
func (a *App) SetConversationModel(id, model string) SimpleResult {
	id = strings.TrimSpace(id)
	if id == "" {
		return SimpleResult{Error: "id is empty"}
	}
	model = strings.TrimSpace(model)

	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	idx := findConvIndex(c.Conversations, id)
	if idx < 0 {
		return SimpleResult{Error: "conversation not found"}
	}
	if c.Conversations[idx].Model == model {
		return SimpleResult{OK: true}
	}
	c.Conversations[idx].Model = model
	c.Conversations[idx].UpdatedAt = nowUnix()
	if err := a.saveConversationsLocked(c); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// SelectConversation marks a conversation as the active one.
func (a *App) SelectConversation(id string) SimpleResult {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return SimpleResult{Error: err.Error()}
	}
	if id != "" {
		if findConvIndex(c.Conversations, id) < 0 {
			return SimpleResult{Error: "conversation not found"}
		}
	}
	c.SelectedID = id
	if err := a.saveConversationsLocked(c); err != nil {
		return SimpleResult{Error: err.Error()}
	}
	return SimpleResult{OK: true}
}

// ---- streaming ----

// StartChatStream kicks off a streaming chat completion. It returns
// immediately with a stream id; the actual content arrives asynchronously
// via runtime events on channels named ai:stream:<id>:{chunk,done,error}.
//
// If req.ConversationID is set AND req.UserMessage is non-empty:
//   - the user message is appended (and persisted) before the stream starts
//   - on a normal completion, the accumulated assistant message is also
//     appended and persisted
//   - the conversation Title is auto-derived from the first user message
//     when previously empty / "新对话"
//
// If ConversationID is empty, the stream is ephemeral (no persistence). This
// is the path used by the inline rewrite modal.
func (a *App) StartChatStream(req StartChatRequest) StartChatResult {
	if a.ctx == nil {
		return StartChatResult{Error: "应用上下文未初始化"}
	}
	if len(req.Messages) == 0 {
		return StartChatResult{Error: "messages is empty"}
	}

	cfg, err := persist.LoadAIConfig(a.aiConfigPath)
	if err != nil {
		return StartChatResult{Error: "load config: " + err.Error()}
	}
	if strings.TrimSpace(cfg.BaseURL) == "" {
		return StartChatResult{Error: "请先在 设置 → AI 设置 中填入 Base URL"}
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = strings.TrimSpace(cfg.DefaultModel)
	}
	if model == "" {
		return StartChatResult{Error: "未指定模型"}
	}

	if req.ConversationID != "" && strings.TrimSpace(req.UserMessage) != "" {
		if err := a.persistUserMessage(req.ConversationID, req.UserMessage, model); err != nil {
			return StartChatResult{Error: err.Error()}
		}
	}

	streamID := newRandomID()
	chunkEvent := "ai:stream:" + streamID + ":chunk"
	doneEvent := "ai:stream:" + streamID + ":done"
	errEvent := "ai:stream:" + streamID + ":error"

	apiMessages := make([]ai.Message, 0, len(req.Messages))
	for _, m := range req.Messages {
		apiMessages = append(apiMessages, ai.Message{Role: m.Role, Content: m.Content})
	}

	chatReq := ai.ChatRequest{
		Model:    model,
		Messages: apiMessages,
	}

	streamCtx, cancel := context.WithCancel(context.Background())
	a.aiStreams.add(streamID, cancel)

	client := ai.NewClient(cfg.BaseURL, cfg.APIKey)

	// Audit log: record what we are about to send so users can later prove
	// which model the request actually carried (versus what the model claims
	// it is in its reply). Sensitive fields (API key, message bodies) are
	// not logged.
	convTag := req.ConversationID
	if convTag == "" {
		convTag = "<inline>"
	}
	a.logger.Printf(
		"ai stream %s | model=%s | base=%s | conv=%s | msgs=%d",
		streamID, model, cfg.BaseURL, convTag, len(apiMessages),
	)

	go func() {
		defer a.aiStreams.remove(streamID)
		defer cancel()

		var assistantBuf strings.Builder
		var finishReason string

		err := client.Stream(
			streamCtx,
			chatReq,
			func(d ai.Delta) {
				if d.Content != "" {
					assistantBuf.WriteString(d.Content)
				}
				if d.Content != "" || d.Role != "" {
					runtime.EventsEmit(a.ctx, chunkEvent, map[string]any{
						"delta": d.Content,
						"role":  d.Role,
					})
				}
			},
			func(f ai.FinishInfo) {
				finishReason = f.FinishReason
			},
		)

		if errors.Is(err, context.Canceled) {
			// Cancelled by user; persist whatever we have so it isn't lost.
			if req.ConversationID != "" && assistantBuf.Len() > 0 {
				_ = a.persistAssistantMessage(req.ConversationID, assistantBuf.String(), model)
			}
			runtime.EventsEmit(a.ctx, errEvent, map[string]any{
				"error":   "已取消",
				"content": assistantBuf.String(),
			})
			return
		}
		if err != nil {
			a.logger.Printf("ai stream %s | model=%s | upstream error: %v", streamID, model, err)
			runtime.EventsEmit(a.ctx, errEvent, map[string]any{
				"error":   err.Error(),
				"content": assistantBuf.String(),
			})
			return
		}

		if req.ConversationID != "" && assistantBuf.Len() > 0 {
			if perr := a.persistAssistantMessage(req.ConversationID, assistantBuf.String(), model); perr != nil {
				a.logger.Printf("ai: persist assistant: %v", perr)
			}
		}

		a.logger.Printf("ai stream %s | model=%s | done | finishReason=%q | bytes=%d",
			streamID, model, finishReason, assistantBuf.Len())

		runtime.EventsEmit(a.ctx, doneEvent, map[string]any{
			"finishReason": finishReason,
			"content":      assistantBuf.String(),
		})
	}()

	return StartChatResult{StreamID: streamID}
}

// CancelChatStream cancels an active stream by id. Safe to call with an id
// that's already finished.
func (a *App) CancelChatStream(streamID string) SimpleResult {
	streamID = strings.TrimSpace(streamID)
	if streamID == "" {
		return SimpleResult{Error: "streamId is empty"}
	}
	a.aiStreams.cancel(streamID)
	return SimpleResult{OK: true}
}

func (a *App) persistUserMessage(conversationID, content, model string) error {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return err
	}
	idx := findConvIndex(c.Conversations, conversationID)
	if idx < 0 {
		return errors.New("conversation not found")
	}
	now := nowUnix()
	c.Conversations[idx].Messages = append(c.Conversations[idx].Messages, persist.ChatMessage{
		Role:      persist.ChatRoleUser,
		Content:   content,
		CreatedAt: now,
	})
	c.Conversations[idx].UpdatedAt = now
	// Always track the latest model actually used for this conversation, so
	// the UI can show "this conversation is talking to model X" without
	// guessing. The frontend explicitly passes the user's current pick.
	if model != "" {
		c.Conversations[idx].Model = model
	}
	// Auto-title if the conversation hasn't been named.
	if c.Conversations[idx].Title == "" || c.Conversations[idx].Title == "新对话" {
		c.Conversations[idx].Title = persist.SummarizeTitle(content)
	}
	return a.saveConversationsLocked(c)
}

func (a *App) persistAssistantMessage(conversationID, content, model string) error {
	a.aiMu.Lock()
	defer a.aiMu.Unlock()

	c, err := a.loadConversationsLocked()
	if err != nil {
		return err
	}
	idx := findConvIndex(c.Conversations, conversationID)
	if idx < 0 {
		return errors.New("conversation not found")
	}
	now := nowUnix()
	c.Conversations[idx].Messages = append(c.Conversations[idx].Messages, persist.ChatMessage{
		Role:      persist.ChatRoleAssistant,
		Content:   content,
		CreatedAt: now,
	})
	c.Conversations[idx].UpdatedAt = now
	if model != "" {
		c.Conversations[idx].Model = model
	}
	return a.saveConversationsLocked(c)
}

func sortConversationsDesc(list []ConversationMetaDTO) {
	// In-place insertion sort by UpdatedAt desc; n is small (<=200).
	for i := 1; i < len(list); i++ {
		j := i
		for j > 0 && list[j-1].UpdatedAt < list[j].UpdatedAt {
			list[j-1], list[j] = list[j], list[j-1]
			j--
		}
	}
}
