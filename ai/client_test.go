package ai

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// flushWriter forces buffered chunks down to the client immediately.
type flushWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func newFlush(w http.ResponseWriter) (*flushWriter, error) {
	f, ok := w.(http.Flusher)
	if !ok {
		return nil, errors.New("ResponseWriter does not implement http.Flusher")
	}
	return &flushWriter{w: w, f: f}, nil
}

func (f *flushWriter) write(s string) {
	_, _ = io.WriteString(f.w, s)
	f.f.Flush()
}

// streamServer returns a test server that writes the given SSE frames in
// order, flushing between each. Each frame should already include the
// trailing "\n\n".
func streamServer(t *testing.T, frames []string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("unexpected Authorization header: %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fw, err := newFlush(w)
		if err != nil {
			t.Errorf("flush: %v", err)
			return
		}
		for _, frame := range frames {
			fw.write(frame)
		}
	}))
}

func basicReq() ChatRequest {
	return ChatRequest{
		Model: "test-model",
		Messages: []Message{
			{Role: "user", Content: "hello"},
		},
	}
}

func TestStreamHappyPath(t *testing.T) {
	frames := []string{
		"data: " + `{"choices":[{"index":0,"delta":{"role":"assistant"}}]}` + "\n\n",
		"data: " + `{"choices":[{"index":0,"delta":{"content":"Hel"}}]}` + "\n\n",
		"data: " + `{"choices":[{"index":0,"delta":{"content":"lo!"}}]}` + "\n\n",
		"data: " + `{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}` + "\n\n",
		"data: [DONE]\n\n",
	}
	srv := streamServer(t, frames)
	defer srv.Close()

	c := NewClient(srv.URL, "test-key")
	var out strings.Builder
	var doneInfo FinishInfo
	var doneCalled atomic.Int32
	err := c.Stream(context.Background(), basicReq(),
		func(d Delta) { out.WriteString(d.Content) },
		func(f FinishInfo) { doneInfo = f; doneCalled.Add(1) },
	)
	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}
	if got := out.String(); got != "Hello!" {
		t.Errorf("aggregated content = %q, want %q", got, "Hello!")
	}
	if doneCalled.Load() != 1 {
		t.Errorf("onDone calls = %d, want 1", doneCalled.Load())
	}
	if doneInfo.FinishReason != "stop" {
		t.Errorf("finishReason = %q, want %q", doneInfo.FinishReason, "stop")
	}
}

func TestStreamHandlesCRLFAndComments(t *testing.T) {
	// Mix CRLF endings and a comment line; ensure they are tolerated.
	frames := []string{
		": ping\r\n\r\n",
		"data: " + `{"choices":[{"index":0,"delta":{"content":"A"}}]}` + "\r\n\r\n",
		"data: " + `{"choices":[{"index":0,"delta":{"content":"B"}}]}` + "\r\n\r\n",
		"data: [DONE]\r\n\r\n",
	}
	srv := streamServer(t, frames)
	defer srv.Close()
	c := NewClient(srv.URL, "test-key")

	var out strings.Builder
	err := c.Stream(context.Background(), basicReq(),
		func(d Delta) { out.WriteString(d.Content) }, nil)
	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}
	if got := out.String(); got != "AB" {
		t.Errorf("aggregated = %q, want AB", got)
	}
}

func TestStreamHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"message":"Invalid API key","type":"invalid_request_error"}}`)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-key")
	err := c.Stream(context.Background(), basicReq(), nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "Invalid API key") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestStreamHTTPErrorPlainBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, "upstream is down")
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-key")
	err := c.Stream(context.Background(), basicReq(), nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "502") || !strings.Contains(err.Error(), "upstream is down") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestStreamContextCancel(t *testing.T) {
	// A handler that streams forever until the client disconnects.
	releaseCh := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fw, err := newFlush(w)
		if err != nil {
			return
		}
		// One initial chunk so the client confirms the stream is open.
		fw.write("data: " + `{"choices":[{"index":0,"delta":{"content":"first"}}]}` + "\n\n")
		select {
		case <-releaseCh:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(releaseCh)

	c := NewClient(srv.URL, "test-key")
	ctx, cancel := context.WithCancel(context.Background())

	gotChunk := make(chan struct{}, 1)
	errCh := make(chan error, 1)
	go func() {
		errCh <- c.Stream(ctx, basicReq(),
			func(d Delta) {
				if d.Content != "" {
					select {
					case gotChunk <- struct{}{}:
					default:
					}
				}
			}, nil)
	}()

	select {
	case <-gotChunk:
	case <-time.After(2 * time.Second):
		t.Fatal("first chunk never arrived")
	}
	cancel()

	select {
	case err := <-errCh:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Stream did not return after cancel")
	}
}

func TestStreamMalformedFrame(t *testing.T) {
	frames := []string{
		"data: not-json\n\n",
	}
	srv := streamServer(t, frames)
	defer srv.Close()

	c := NewClient(srv.URL, "test-key")
	err := c.Stream(context.Background(), basicReq(), nil, nil)
	if err == nil {
		t.Fatal("expected parse error, got nil")
	}
	if !strings.Contains(err.Error(), "parse stream frame") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestStreamNoTerminator(t *testing.T) {
	// Server hangs up after a couple of valid frames without sending [DONE].
	frames := []string{
		"data: " + `{"choices":[{"index":0,"delta":{"content":"X"}}]}` + "\n\n",
		"data: " + `{"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}` + "\n\n",
	}
	srv := streamServer(t, frames)
	defer srv.Close()
	c := NewClient(srv.URL, "test-key")

	var content strings.Builder
	var doneInfo FinishInfo
	var doneCalls int
	err := c.Stream(context.Background(), basicReq(),
		func(d Delta) { content.WriteString(d.Content) },
		func(f FinishInfo) { doneInfo = f; doneCalls++ },
	)
	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}
	if content.String() != "X" {
		t.Errorf("content = %q, want X", content.String())
	}
	if doneCalls != 1 {
		t.Errorf("onDone calls = %d, want 1", doneCalls)
	}
	if doneInfo.FinishReason != "length" {
		t.Errorf("finishReason = %q, want length", doneInfo.FinishReason)
	}
}

func TestStreamRequestBody(t *testing.T) {
	type captured struct {
		body string
		auth string
		ct   string
	}
	var cap captured
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 0, 1024)
		sc := bufio.NewScanner(r.Body)
		for sc.Scan() {
			buf = append(buf, sc.Bytes()...)
		}
		mu.Lock()
		cap = captured{
			body: string(buf),
			auth: r.Header.Get("Authorization"),
			ct:   r.Header.Get("Content-Type"),
		}
		mu.Unlock()
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fw, _ := newFlush(w)
		fw.write("data: [DONE]\n\n")
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-key")
	err := c.Stream(context.Background(), ChatRequest{
		Model:    "gpt-test",
		Messages: []Message{{Role: "user", Content: "yo"}},
	}, nil, nil)
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if cap.auth != "Bearer test-key" {
		t.Errorf("auth = %q", cap.auth)
	}
	if !strings.Contains(cap.ct, "application/json") {
		t.Errorf("content-type = %q", cap.ct)
	}
	for _, want := range []string{
		`"model":"gpt-test"`,
		`"stream":true`,
		`"role":"user"`,
		`"content":"yo"`,
	} {
		if !strings.Contains(cap.body, want) {
			t.Errorf("body missing %q: %s", want, cap.body)
		}
	}
	// Sanity: explicitly forbidden parameters must not leak into the body.
	for _, banned := range []string{`"temperature"`, `"max_tokens"`, `"max_completion_tokens"`} {
		if strings.Contains(cap.body, banned) {
			t.Errorf("body unexpectedly contains %s: %s", banned, cap.body)
		}
	}
}

func TestStreamValidation(t *testing.T) {
	cases := []struct {
		name string
		req  ChatRequest
		base string
		want string
	}{
		{"missing baseURL", basicReq(), "", "baseURL"},
		{"empty model", ChatRequest{Messages: []Message{{Role: "user", Content: "x"}}}, "https://example.com", "model"},
		{"empty messages", ChatRequest{Model: "m"}, "https://example.com", "messages"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := NewClient(tc.base, "k")
			err := c.Stream(context.Background(), tc.req, nil, nil)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want substring %q", err, tc.want)
			}
		})
	}
}

func TestPing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"hi"}}]}`)
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "k")
	if err := c.Ping(context.Background(), "m"); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

func TestPingError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"error":{"message":"forbidden"}}`)
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "k")
	err := c.Ping(context.Background(), "m")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "forbidden") {
		t.Errorf("unexpected: %v", err)
	}
}

// modelsServer returns a test server that responds to GET /models with the
// supplied body and status. The Authorization header is asserted when
// expectAuth is non-empty.
func modelsServer(t *testing.T, status int, body string, expectAuth string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("models: unexpected method %s", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/models") {
			t.Errorf("models: unexpected path %s", r.URL.Path)
		}
		if expectAuth != "" && r.Header.Get("Authorization") != expectAuth {
			t.Errorf("models: auth = %q, want %q", r.Header.Get("Authorization"), expectAuth)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
}

func TestListModelsOpenAIShape(t *testing.T) {
	body := `{
		"object": "list",
		"data": [
			{"id": "gpt-4o", "owned_by": "openai", "created": 1710000000},
			{"id": "gpt-4o-mini", "owned_by": "openai"},
			{"id": "gpt-4o"}
		]
	}`
	srv := modelsServer(t, http.StatusOK, body, "Bearer k")
	defer srv.Close()
	c := NewClient(srv.URL, "k")

	got, err := c.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (deduped)", len(got))
	}
	// Sorted alphabetically (case-insensitive).
	if got[0].ID != "gpt-4o" || got[1].ID != "gpt-4o-mini" {
		t.Errorf("order = %+v", got)
	}
	if got[0].OwnedBy != "openai" || got[0].Created != 1710000000 {
		t.Errorf("owned_by/created not preserved: %+v", got[0])
	}
}

func TestListModelsOllamaShape(t *testing.T) {
	body := `{
		"models": [
			{"name": "llama3:latest"},
			{"model": "qwen2.5-coder:7b"},
			{"id": "phi3:mini"}
		]
	}`
	srv := modelsServer(t, http.StatusOK, body, "")
	defer srv.Close()
	c := NewClient(srv.URL, "") // no auth required

	got, err := c.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels: %v", err)
	}
	ids := make([]string, 0, len(got))
	for _, m := range got {
		ids = append(ids, m.ID)
	}
	want := []string{"llama3:latest", "phi3:mini", "qwen2.5-coder:7b"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Errorf("ids = %v, want %v", ids, want)
	}
}

func TestListModelsBareArray(t *testing.T) {
	body := `[{"id":"a"},{"id":"b"},{"id":""},{"id":"a"}]`
	srv := modelsServer(t, http.StatusOK, body, "")
	defer srv.Close()
	c := NewClient(srv.URL, "")

	got, err := c.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels: %v", err)
	}
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Errorf("got = %+v, want [a,b]", got)
	}
}

func TestListModelsEmpty(t *testing.T) {
	srv := modelsServer(t, http.StatusOK, `{"object":"list","data":[]}`, "")
	defer srv.Close()
	c := NewClient(srv.URL, "")

	_, err := c.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected error for empty list, got nil")
	}
	if !strings.Contains(err.Error(), "no models") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestListModelsHTTPError(t *testing.T) {
	srv := modelsServer(t, http.StatusUnauthorized, `{"error":{"message":"bad key"}}`, "")
	defer srv.Close()
	c := NewClient(srv.URL, "k")

	_, err := c.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "bad key") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestListModelsMalformed(t *testing.T) {
	srv := modelsServer(t, http.StatusOK, `not json at all`, "")
	defer srv.Close()
	c := NewClient(srv.URL, "")

	_, err := c.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected parse error")
	}
	if !strings.Contains(err.Error(), "/models") {
		t.Errorf("unexpected: %v", err)
	}
}

func TestListModelsValidation(t *testing.T) {
	c := NewClient("", "k")
	_, err := c.ListModels(context.Background())
	if err == nil || !strings.Contains(err.Error(), "baseURL") {
		t.Fatalf("err = %v, want baseURL validation", err)
	}
}

// Sanity check: scanner can handle a single very large frame (some providers
// emit large priming chunks).
func TestStreamLargeFrame(t *testing.T) {
	big := strings.Repeat("x", 200_000)
	frames := []string{
		"data: " + fmt.Sprintf(`{"choices":[{"index":0,"delta":{"content":%q}}]}`, big) + "\n\n",
		"data: [DONE]\n\n",
	}
	srv := streamServer(t, frames)
	defer srv.Close()
	c := NewClient(srv.URL, "test-key")

	var got strings.Builder
	err := c.Stream(context.Background(), basicReq(),
		func(d Delta) { got.WriteString(d.Content) }, nil)
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	if got.Len() != len(big) {
		t.Errorf("got len = %d, want %d", got.Len(), len(big))
	}
}
