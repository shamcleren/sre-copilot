package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/observability"
)

const completion = `{"id":"chat-fixture","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"Check readiness."},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}}`

func fixtureConfig(url string) config.Config {
	return config.Config{BaseURL: url + "/v1", Model: "fixture-model", APIKey: "fixture-secret", Timeout: 2 * time.Second, MaxLLMCalls: 2}
}

func TestRealSDKAgainstLocalHTTP(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/chat/completions" || r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer fixture-secret" {
			t.Error("unexpected API path, method or authorization")
		}
		var body struct {
			Model    string `json:"model"`
			Stream   bool   `json:"stream"`
			Messages []struct{ Role, Content string }
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Model != "fixture-model" || body.Stream || len(body.Messages) < 2 || body.Messages[len(body.Messages)-1].Content != "fixture-private-prompt" {
			t.Error("model, streaming or messages not wired correctly")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(completion))
	}))
	defer server.Close()
	var logs bytes.Buffer
	result, err := Run(context.Background(), fixtureConfig(server.URL), "fixture-private-prompt", observability.NewLogger(&logs))
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "Check readiness." || calls.Load() != 1 || !result.UsageReported || result.Usage.TotalTokens != 14 || result.Usage.PromptTokens != 11 {
		t.Fatalf("unexpected text, call count or usage: calls=%d tokens=%d reported=%v", calls.Load(), result.Usage.TotalTokens, result.UsageReported)
	}
	for _, value := range []string{"fixture-secret", "fixture-private-prompt", "Check readiness."} {
		if strings.Contains(logs.String(), value) {
			t.Fatal("logs contain private content")
		}
	}
	seen := map[string]map[string]any{}
	for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatal(err)
		}
		if record["run_id"] != result.RunID || result.RunID == "" {
			t.Fatal("missing run correlation")
		}
		seen[record["msg"].(string)] = record
	}
	for _, name := range []string{"run.started", "model.started", "model.completed", "agent.event", "run.completed"} {
		if seen[name] == nil {
			t.Fatalf("missing event %s", name)
		}
	}
	if seen["model.started"]["call_id"] == "" || seen["model.started"]["call_id"] != seen["model.completed"]["call_id"] || seen["run.completed"]["status"] != "ok" {
		t.Fatal("model correlation or run status is incorrect")
	}
}

func TestEmptyOrMissingUsage(t *testing.T) {
	for _, tc := range []struct {
		name, response string
		wantErr        error
	}{
		{"empty", strings.Replace(completion, "Check readiness.", "", 1), ErrEmptyAnswer},
		{"missing usage", strings.Replace(completion, `,"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}`, "", 1), nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.response))
			}))
			defer server.Close()
			var logs bytes.Buffer
			result, err := Run(context.Background(), fixtureConfig(server.URL), "question", observability.NewLogger(&logs))
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.name == "missing usage" && result.UsageReported {
				t.Fatal("missing usage must remain unknown")
			}
		})
	}
}

func TestTimeoutAndCancellation(t *testing.T) {
	for _, cancelRun := range []bool{false, true} {
		t.Run(map[bool]string{false: "timeout", true: "canceled"}[cancelRun], func(t *testing.T) {
			entered := make(chan struct{}, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				entered <- struct{}{}
				select {
				case <-r.Context().Done():
				case <-time.After(time.Second):
				}
			}))
			defer server.Close()
			cfg := fixtureConfig(server.URL)
			if !cancelRun {
				cfg.Timeout = 80 * time.Millisecond
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			var logs bytes.Buffer
			go func() {
				_, err := Run(ctx, cfg, "question", observability.NewLogger(&logs))
				done <- err
			}()
			select {
			case <-entered:
			case <-time.After(2 * time.Second):
				t.Fatal("model request did not arrive")
			}
			wantErr := context.DeadlineExceeded
			if cancelRun {
				wantErr = context.Canceled
				cancel()
			}
			select {
			case err := <-done:
				if !errors.Is(err, wantErr) {
					t.Fatalf("expected %v, got %v", wantErr, err)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("run did not stop within the deadline")
			}
		})
	}
}
