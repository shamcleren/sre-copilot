package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/shamcleren/sre-copilot/internal/changes"
	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/observability"
)

func TestRunAndApprovalUseTheSameState(t *testing.T) {
	state := t.TempDir()
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role, Content string
			}
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		content := "还不能创建告警。"
		for _, message := range body.Messages {
			if strings.Contains(message.Content, "AWAITING_APPROVAL") {
				content = "计划已生成，等待人工确认。"
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chat-fixture","object":"chat.completion","created":1,"model":"fixture-model","choices":[{"index":0,"message":{"role":"assistant","content":"` + content + `"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
	}))
	defer model.Close()
	cfg := config.Config{
		BaseURL: model.URL + "/v1", Model: "fixture-model", APIKey: "fixture-secret",
		Timeout: 5 * time.Second, MaxLLMCalls: 2, StateDir: state, LocalAPIToken: "local-token",
	}
	handler := New(cfg, observability.NewLogger(&bytes.Buffer{}))

	plan, err := changes.Open(state).Propose(changes.AlertInput{
		Service: "demo-service", AlertName: "http-5xx-rate",
		Query: "sum(rate(http_requests_total[5m]))", Threshold: 0.05, WindowMinutes: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	unauthorized := httptest.NewRequest(http.MethodPost, "/v1/alert-plans/"+plan.ID+"/approvals", strings.NewReader(`{"actor_id":"oncall"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, unauthorized)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing token status = %d", rec.Code)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/alert-plans/"+plan.ID+"/approvals", strings.NewReader(`{"actor_id":"oncall"}`))
	req.Header.Set("Authorization", "Bearer local-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "local-token") {
		t.Fatalf("approval response = %d %s", rec.Code, rec.Body.String())
	}

	runReq := httptest.NewRequest(http.MethodPost, "/v1/runs", strings.NewReader(`{"prompt":"执行计划了吗"}`))
	runReq.Header.Set("Authorization", "Bearer local-token")
	runRec := httptest.NewRecorder()
	handler.ServeHTTP(runRec, runReq)
	if runRec.Code != http.StatusOK || !strings.Contains(runRec.Body.String(), "还不能创建告警") {
		t.Fatalf("run response = %d %s", runRec.Code, runRec.Body.String())
	}
}

func TestErrListenIsDistinct(t *testing.T) {
	if ErrListen == nil {
		t.Fatal("missing listen error")
	}
}
