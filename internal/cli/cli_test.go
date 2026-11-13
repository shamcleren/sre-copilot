package cli

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func testLookup(url string) func(string) (string, bool) {
	values := map[string]string{"LLM_BASE_URL": url + "/v1", "LLM_MODEL": "fixture-model", "LLM_API_KEY": "fixture-secret"}
	return func(key string) (string, bool) { value, ok := values[key]; return value, ok }
}

func TestDoctorMakesNoRequest(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests.Add(1) }))
	defer server.Close()
	var out, logs bytes.Buffer
	code := Execute(context.Background(), []string{"--doctor", "--env-file", ""}, &out, &logs, testLookup(server.URL))
	if code != 0 || requests.Load() != 0 || !strings.Contains(out.String(), "configuration_ready") || strings.Contains(out.String()+logs.String(), "fixture-secret") {
		t.Fatal("doctor must validate without making a request or exposing credentials")
	}
	out.Reset()
	code = Execute(context.Background(), []string{"--doctor", "--env-file", ""}, &out, &logs, func(string) (string, bool) { return "", false })
	if code != 2 || strings.Contains(out.String(), "configuration_ready") {
		t.Fatal("missing settings must not report ready")
	}
}

func TestApproveAndPublicListen(t *testing.T) {
	state := t.TempDir()
	var out, logs bytes.Buffer
	code := Execute(context.Background(), []string{"approve", "--plan-id", "missing", "--actor", "oncall", "--state-dir", state}, &out, &logs, testLookup("http://127.0.0.1:9"))
	if code != 1 || out.Len() != 0 {
		t.Fatalf("missing plan code=%d out=%s", code, out.String())
	}
	code = Execute(context.Background(), []string{"serve", "--addr", "0.0.0.0:9", "--env-file", ""}, &out, &logs, testLookup("http://127.0.0.1:9"))
	if code != 2 || !strings.Contains(logs.String(), "LOCAL_API_TOKEN") {
		t.Fatalf("public listen code=%d logs=%s", code, logs.String())
	}
}

func TestProviderFailureDoesNotEchoSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid key fixture-secret; prompt fixture-private-prompt","type":"authentication_error"}}`))
	}))
	defer server.Close()
	var out, logs bytes.Buffer
	code := Execute(context.Background(), []string{"--env-file", "", "--prompt", "fixture-private-prompt"}, &out, &logs, testLookup(server.URL))
	if code != 1 || out.Len() != 0 || !strings.Contains(logs.String(), `"status":"error"`) {
		t.Fatal("provider failure must fail the command and record an error outcome")
	}
	for _, value := range []string{"fixture-secret", "fixture-private-prompt"} {
		if strings.Contains(logs.String(), value) {
			t.Fatal("provider failure exposed private content")
		}
	}
}
