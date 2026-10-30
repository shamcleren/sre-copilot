package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func lookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) { v, ok := values[key]; return v, ok }
}

func TestLoadPrecedenceAndDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte("LLM_BASE_URL=https://example.invalid/v1\nLLM_MODEL=file-model\nLLM_API_KEY=fixture-key\n"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path, lookup(map[string]string{"LLM_MODEL": "exported-model"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Model != "exported-model" || cfg.APIKey != "fixture-key" || cfg.Timeout != 30*time.Second || cfg.MaxLLMCalls != 8 {
		t.Fatal("env precedence or defaults are incorrect")
	}
	_, err = Load(path, lookup(map[string]string{"LLM_API_KEY": ""}))
	if err == nil || !strings.Contains(err.Error(), "LLM_API_KEY") {
		t.Fatal("explicitly empty environment must override file")
	}
}

func TestInvalidConfigDoesNotEchoValues(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"LLM_BASE_URL", ""}, {"LLM_MODEL", ""}, {"LLM_API_KEY", ""},
		{"LLM_BASE_URL", "file:///fixture-secret"},
		{"LLM_BASE_URL", "https://fixture-secret@example.invalid/v1"},
		{"LLM_BASE_URL", "https://example.invalid/v1?key=fixture-secret"},
		{"REQUEST_TIMEOUT", "fixture-secret"}, {"REQUEST_TIMEOUT", "0s"},
		{"MAX_LLM_CALLS", "fixture-secret"}, {"MAX_LLM_CALLS", "-1"},
	} {
		t.Run(tc.key+"/"+tc.value, func(t *testing.T) {
			values := map[string]string{"LLM_BASE_URL": "http://localhost:1234/v1", "LLM_MODEL": "test", "LLM_API_KEY": "fixture-secret"}
			values[tc.key] = tc.value
			_, err := Load("", lookup(values))
			if err == nil || strings.Contains(err.Error(), "fixture-secret") {
				t.Fatal("expected a configuration error without values")
			}
		})
	}
}

func TestMalformedEnvIsNotEchoed(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte("LLM_API_KEY=\"fixture-secret"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := Load(path, lookup(nil))
	if err == nil || strings.Contains(err.Error(), "fixture-secret") {
		t.Fatal("expected a private parse failure")
	}
}
