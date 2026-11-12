package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/observability"
)

func TestModelLoopCallsBKCLIAndUsesItsOutput(t *testing.T) {
	binDir := t.TempDir()
	argsFile := filepath.Join(binDir, "args.txt")
	script := filepath.Join(binDir, "bk-cli")
	body := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"" + argsFile + "\"\nprintf '%s\\n' '{\"ok\":true,\"data\":{\"source\":\"fake-bk-cli\",\"decision\":\"no_rows\"}}'\n"
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		t.Fatal(err)
	}
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		raw, _ := json.Marshal(payload)
		requests = append(requests, string(raw))
		w.Header().Set("Content-Type", "application/json")
		if !strings.Contains(string(raw), "fake-bk-cli") {
			_, _ = w.Write([]byte(`{"id":"call-1","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"","tool_calls":[{"id":"call_bk","type":"function","function":{"name":"bk_cli_monitor","arguments":"{\"args\":[\"monitor\",\"log\",\"search_logs\",\"--since\",\"15m\"]}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"call-2","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"最近 15 分钟没有错误日志。来源 fake-bk-cli。"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}`))
	}))
	defer server.Close()
	cfg := config.Config{
		BaseURL: server.URL + "/v1", Model: "fixture-model", APIKey: "fixture-secret",
		Timeout: 10 * time.Second, MaxLLMCalls: 4, BKCLIPath: script, StateDir: t.TempDir(),
	}
	var logs strings.Builder
	result, err := Run(context.Background(), cfg, "最近 15 分钟有没有错误日志", observability.NewLogger(&logs))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.Text, "fake-bk-cli") || !strings.Contains(result.Text, "没有错误日志") {
		t.Fatalf("answer = %q requests=%d", result.Text, len(requests))
	}
	recorded, err := os.ReadFile(argsFile)
	if err != nil || !strings.Contains(string(recorded), "search_logs") {
		t.Fatalf("bk-cli args = %q %v", recorded, err)
	}
	if len(requests) < 2 || !strings.Contains(requests[1], "no_rows") {
		t.Fatal("tool output did not return to the same model")
	}
	if strings.Contains(logs.String(), "fixture-secret") || strings.Contains(logs.String(), "最近 15 分钟有没有错误日志") {
		t.Fatal("logs contain the prompt or credential")
	}
}

func TestModelCannotExecuteAlertWithoutApproval(t *testing.T) {
	state := t.TempDir()
	var step int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		raw, _ := json.Marshal(payload)
		w.Header().Set("Content-Type", "application/json")
		step++
		switch step {
		case 1:
			_, _ = w.Write([]byte(`{"id":"p1","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"call_plan","type":"function","function":{"name":"propose_alert_plan","arguments":"{\"service\":\"demo-service\",\"alert_name\":\"http-5xx-rate\",\"query\":\"sum(rate(http_requests_total[5m]))\",\"threshold\":0.05,\"window_minutes\":5}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
		case 2:
			planID := planIDFrom(string(raw))
			if planID == "" || !strings.Contains(string(raw), "AWAITING_APPROVAL") {
				t.Errorf("proposal was not returned to the model: %s", raw)
			}
			_, _ = w.Write([]byte(`{"id":"p2","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"call_exec","type":"function","function":{"name":"execute_alert_plan","arguments":"{\"plan_id\":\"` + planID + `\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
		default:
			if !strings.Contains(string(raw), "approval required") {
				t.Errorf("execute did not report the missing approval: %s", raw)
			}
			_, _ = w.Write([]byte(`{"id":"p3","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"告警尚未创建，需要人工确认。"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
		}
	}))
	defer server.Close()
	cfg := config.Config{
		BaseURL: server.URL + "/v1", Model: "fixture-model", APIKey: "fixture-secret",
		Timeout: 10 * time.Second, MaxLLMCalls: 4, StateDir: state,
	}
	result, err := Run(context.Background(), cfg, "给 demo-service 创建 5xx 告警", observability.NewLogger(&strings.Builder{}))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.Text, "尚未创建") || step < 3 {
		t.Fatalf("answer=%q steps=%d", result.Text, step)
	}
	entries, err := os.ReadDir(state)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range entries {
		if entry.Name() == "state.json" {
			body, err := os.ReadFile(filepath.Join(state, entry.Name()))
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(body), "SUCCEEDED") {
				t.Fatal("unapproved plan was stored as succeeded")
			}
			found = strings.Contains(string(body), "AWAITING_APPROVAL")
		}
	}
	if !found {
		t.Fatal("plan was not stored")
	}
}

func planIDFrom(body string) string {
	for index := 0; index < len(body); {
		found := strings.Index(body[index:], "plan_")
		if found < 0 {
			return ""
		}
		start := index + found
		rest := body[start:]
		end := strings.IndexAny(rest, `\" ,}`)
		if end < 0 {
			end = len(rest)
		}
		id := rest[:end]
		if strings.HasPrefix(id, "plan_") && len(id) > len("plan_id") {
			return id
		}
		index = start + len("plan_")
	}
	return ""
}
