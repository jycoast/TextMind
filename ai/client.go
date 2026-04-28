// Package ai implements a minimal OpenAI-compatible chat completions client
// with SSE streaming and context-based cancellation.
//
// It targets the /chat/completions endpoint shape used by OpenAI, DeepSeek,
// Moonshot, Azure (with proper baseURL), and local Ollama-style proxies.
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is an OpenAI-compatible chat client.
type Client struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
}

// Option mutates a Client during NewClient.
type Option func(*Client)

// WithHTTPClient overrides the default *http.Client. Mainly for tests.
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) { c.httpClient = h }
}

// NewClient builds a Client. baseURL should be the API root (without
// trailing /chat/completions), e.g. "https://api.openai.com/v1".
func NewClient(baseURL, apiKey string, opts ...Option) *Client {
	c := &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		httpClient: &http.Client{
			// No overall timeout: streaming responses can run for a while.
			// Cancellation is driven by the request context instead.
			Timeout: 0,
		},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Stream invokes /chat/completions with stream=true and dispatches each parsed
// delta to onChunk. onDone is called once on a normal termination ("[DONE]" or
// finish_reason set). It returns:
//
//   - context.Canceled / context.DeadlineExceeded when ctx is cancelled.
//   - A descriptive error on transport, HTTP, or parse failures.
//
// onChunk and onDone are invoked synchronously on the caller's goroutine; they
// must not block for long. They may be nil.
func (c *Client) Stream(
	ctx context.Context,
	req ChatRequest,
	onChunk func(Delta),
	onDone func(FinishInfo),
) error {
	if c.baseURL == "" {
		return errors.New("ai: baseURL is empty")
	}
	if req.Model == "" {
		return errors.New("ai: model is empty")
	}
	if len(req.Messages) == 0 {
		return errors.New("ai: messages is empty")
	}

	req.Stream = true
	body, err := json.Marshal(&req)
	if err != nil {
		return fmt.Errorf("ai: marshal request: %w", err)
	}

	url := c.baseURL + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("ai: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		// Surface ctx errors directly so callers can distinguish cancel vs net.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("ai: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parseHTTPError(resp)
	}

	return readSSE(ctx, resp.Body, onChunk, onDone)
}

// readSSE consumes a Server-Sent Events stream of OpenAI chat completion frames.
//
// The OpenAI spec uses a slightly relaxed SSE: each frame is a single line of
// the form `data: <json>` (or `data: [DONE]` for termination), separated from
// the next frame by a blank line. We accept either CRLF or LF line endings and
// ignore unknown event-stream fields (`event:`, `id:`, `:` comments, ...).
func readSSE(
	ctx context.Context,
	body io.Reader,
	onChunk func(Delta),
	onDone func(FinishInfo),
) error {
	scanner := bufio.NewScanner(body)
	// Allow large frames (some providers emit big role-priming chunks).
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var finishReason string

	for scanner.Scan() {
		// Cooperative cancel between lines.
		if err := ctx.Err(); err != nil {
			return err
		}

		line := strings.TrimRight(scanner.Text(), "\r")
		if line == "" {
			continue
		}
		// Skip SSE comments and non-data fields.
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			if onDone != nil {
				onDone(FinishInfo{FinishReason: finishReason})
			}
			return nil
		}

		var frame streamFrame
		if err := json.Unmarshal([]byte(payload), &frame); err != nil {
			return fmt.Errorf("ai: parse stream frame: %w (payload=%q)", err, truncate(payload, 200))
		}
		for _, ch := range frame.Choices {
			if ch.Delta.Role != "" || ch.Delta.Content != "" {
				if onChunk != nil {
					onChunk(ch.Delta)
				}
			}
			if ch.FinishReason != "" {
				finishReason = ch.FinishReason
			}
		}
	}

	if err := scanner.Err(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("ai: read stream: %w", err)
	}

	// Stream ended without a terminating [DONE]; still notify done with whatever
	// finish_reason we may have captured.
	if onDone != nil {
		onDone(FinishInfo{FinishReason: finishReason})
	}
	return nil
}

// parseHTTPError reads the response body and turns it into a readable error.
func parseHTTPError(resp *http.Response) error {
	const maxBody = 8 * 1024
	data, _ := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	msg := strings.TrimSpace(string(data))

	var env errorEnvelope
	if json.Unmarshal(data, &env) == nil && env.Error.Message != "" {
		return fmt.Errorf("ai: http %d: %s", resp.StatusCode, env.Error.Message)
	}
	if msg == "" {
		msg = http.StatusText(resp.StatusCode)
	}
	return fmt.Errorf("ai: http %d: %s", resp.StatusCode, truncate(msg, 500))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ListModels fetches GET {baseURL}/models and returns the de-duplicated list
// of model identifiers reported by the server. Identifiers are sorted
// alphabetically (case-insensitive) for stable UI rendering.
//
// Tolerated response shapes:
//
//   - {"object":"list","data":[{"id":"...","owned_by":"...","created":...}, ...]}
//   - {"models":[{"id":"..."} | {"name":"..."} | {"model":"..."}, ...]}
//   - bare JSON array of the above objects (rare)
//
// Errors:
//
//   - context errors are returned as-is.
//   - HTTP non-2xx surfaces as "ai: http <code>: <body>"; the OpenAI error
//     envelope is unwrapped when present.
//   - A successful response with zero parseable IDs returns an explicit
//     "no models returned by /models" error so the UI can show something
//     useful instead of an empty list.
func (c *Client) ListModels(ctx context.Context) ([]ModelInfo, error) {
	if c.baseURL == "" {
		return nil, errors.New("ai: baseURL is empty")
	}

	listCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(listCtx, http.MethodGet, c.baseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("ai: build /models request: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		if ctxErr := listCtx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		return nil, fmt.Errorf("ai: GET /models: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, parseHTTPError(resp)
	}

	const maxBody = 4 * 1024 * 1024
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return nil, fmt.Errorf("ai: read /models body: %w", err)
	}

	entries, err := parseModelsBody(data)
	if err != nil {
		return nil, err
	}

	out := make([]ModelInfo, 0, len(entries))
	seen := map[string]struct{}{}
	for _, e := range entries {
		id := strings.TrimSpace(e.chooseID())
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, ModelInfo{
			ID:      id,
			OwnedBy: strings.TrimSpace(e.OwnedBy),
			Created: e.Created,
		})
	}
	if len(out) == 0 {
		return nil, errors.New("ai: no models returned by /models")
	}
	sortModelsByID(out)
	return out, nil
}

// parseModelsBody accepts the three documented shapes and returns the raw
// entries. Order is preserved; de-duplication and sorting happen in the
// caller.
func parseModelsBody(data []byte) ([]rawModelEntry, error) {
	trim := bytes.TrimSpace(data)
	if len(trim) == 0 {
		return nil, errors.New("ai: empty /models body")
	}
	switch trim[0] {
	case '{':
		var env modelsResponse
		if err := json.Unmarshal(trim, &env); err != nil {
			return nil, fmt.Errorf("ai: decode /models: %w (body=%q)", err, truncate(string(trim), 200))
		}
		if len(env.Data) > 0 {
			return env.Data, nil
		}
		return env.Models, nil
	case '[':
		var arr []rawModelEntry
		if err := json.Unmarshal(trim, &arr); err != nil {
			return nil, fmt.Errorf("ai: decode /models array: %w (body=%q)", err, truncate(string(trim), 200))
		}
		return arr, nil
	default:
		return nil, fmt.Errorf("ai: unexpected /models body: %q", truncate(string(trim), 200))
	}
}

// sortModelsByID stable-sorts a small slice of ModelInfo by lower-cased ID.
// n is bounded by the provider's catalog size, typically <200, so insertion
// sort keeps this dependency-free without measurable cost.
func sortModelsByID(list []ModelInfo) {
	for i := 1; i < len(list); i++ {
		j := i
		for j > 0 && strings.ToLower(list[j-1].ID) > strings.ToLower(list[j].ID) {
			list[j-1], list[j] = list[j], list[j-1]
			j--
		}
	}
}

// Ping issues a minimal non-streaming chat call to verify that the configured
// baseURL/key/model triple actually works. It uses a short timeout derived
// from ctx.
//
// On success, returns nil. We deliberately do not set max_tokens here: newer
// providers reject the parameter entirely, and the cost difference for a
// one-word reply is negligible.
func (c *Client) Ping(ctx context.Context, model string) error {
	if c.baseURL == "" {
		return errors.New("ai: baseURL is empty")
	}
	if model == "" {
		return errors.New("ai: model is empty")
	}

	body, err := json.Marshal(&ChatRequest{
		Model: model,
		Messages: []Message{
			{Role: "user", Content: "ping"},
		},
		Stream: false,
	})
	if err != nil {
		return fmt.Errorf("ai: marshal ping: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(pingCtx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("ai: build ping: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		if ctxErr := pingCtx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("ai: ping: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parseHTTPError(resp)
	}
	// We don't actually care about the response shape for ping.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	return nil
}
