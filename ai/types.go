package ai

// Message is a single chat message in OpenAI-compatible format.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the OpenAI-compatible /chat/completions request body.
//
// Only the fields we actually use are exposed. We intentionally do NOT send
// `temperature` or `max_tokens`: newer OpenAI models (o1 / GPT-5 family)
// reject `max_tokens` outright (the spec moved it to `max_completion_tokens`)
// and many fine-tuned models pin `temperature`. Letting the server choose
// keeps this client compatible across providers.
type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

// Delta is one streamed chunk of an assistant message.
type Delta struct {
	Role    string `json:"role,omitempty"`
	Content string `json:"content,omitempty"`
}

// FinishInfo is reported once when the stream terminates normally.
type FinishInfo struct {
	FinishReason string
}

// streamChoice mirrors a single element of the `choices` array in a streaming
// chat completion frame.
type streamChoice struct {
	Index        int    `json:"index"`
	Delta        Delta  `json:"delta"`
	FinishReason string `json:"finish_reason,omitempty"`
}

// streamFrame is one parsed `data:` SSE frame for streaming chat completions.
type streamFrame struct {
	ID      string         `json:"id,omitempty"`
	Object  string         `json:"object,omitempty"`
	Choices []streamChoice `json:"choices"`
}

// errorEnvelope is the OpenAI-style error body returned on non-2xx responses.
type errorEnvelope struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type,omitempty"`
		Code    string `json:"code,omitempty"`
	} `json:"error"`
}

// ModelInfo describes a single model returned by GET /models. Only the
// commonly-supplied fields are exposed; OwnedBy and Created are best-effort
// hints, the canonical id is ID.
type ModelInfo struct {
	ID      string `json:"id"`
	OwnedBy string `json:"ownedBy,omitempty"`
	Created int64  `json:"created,omitempty"`
}

// modelsResponse mirrors the OpenAI /models response envelope.
//
// We accept both shapes seen in the wild:
//
//   - OpenAI / DeepSeek / Moonshot: {"object":"list","data":[{"id":...}, ...]}
//   - Some local proxies: {"models":[{"id":...} | "name", ...]}
//
// Bare arrays are handled by the client by decoding into a []rawModelEntry
// fallback. See Client.ListModels for the parsing rules.
type modelsResponse struct {
	Object string           `json:"object,omitempty"`
	Data   []rawModelEntry  `json:"data,omitempty"`
	Models []rawModelEntry  `json:"models,omitempty"`
}

// rawModelEntry tolerates both object form ({"id": "..."}) and Ollama-style
// ({"name": "..."}). Empty IDs are filtered out by the caller.
type rawModelEntry struct {
	ID      string `json:"id,omitempty"`
	Name    string `json:"name,omitempty"`
	Model   string `json:"model,omitempty"`
	OwnedBy string `json:"owned_by,omitempty"`
	Created int64  `json:"created,omitempty"`
}

func (e rawModelEntry) chooseID() string {
	if e.ID != "" {
		return e.ID
	}
	if e.Model != "" {
		return e.Model
	}
	return e.Name
}
