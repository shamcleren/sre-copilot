package sretools

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestValidateMonitorArgs(t *testing.T) {
	allowed := [][]string{
		{"version"},
		{"monitor", "--help"},
		{"monitor", "log", "--help"},
		{"monitor", "log", "search_logs", "--since", "15m"},
		{"monitor", "metric", "query", "--dry-run"},
		{"monitor", "tools", "schema", "--tool", "search_logs"},
		{"monitor", "tools", "search", "--category", "log"},
		{"monitor", "space", "search_spaces"},
		{"monitor", "status"},
	}
	for _, args := range allowed {
		if err := validateMonitorArgs(args); err != nil {
			t.Fatalf("allowed %q: %v", args, err)
		}
	}
	rejected := [][]string{
		{},
		{"update"},
		{"version", "--verbose"},
		{"monitor"},
		{"monitor", "status", "--check_update"},
		{"monitor", "log", "create"},
		{"monitor", "tools", "download"},
		{"monitor", "shell", "search"},
		{"monitor", "log", "search_logs", "--bk_biz_id", "<业务ID>"},
		{"monitor", "log", "search_logs", "line\nbreak"},
		{"monitor", "status", "update"},
	}
	for _, args := range rejected {
		if err := validateMonitorArgs(args); err == nil {
			t.Fatalf("rejected %q", args)
		}
	}
}

func TestQueryReturnsExitCodeAndRedactsSecrets(t *testing.T) {
	tool := &MonitorTool{
		bin: "bk-cli",
		run: func(context.Context, string, []string) ([]byte, []byte, int, error) {
			return []byte(`{"ok":false,"api_key=fixture-secret"}`), []byte("authorization: fixture-token"), 2, nil
		},
	}
	output, err := tool.Query(context.Background(), MonitorInput{Args: []string{"version"}})
	if err != nil {
		t.Fatal(err)
	}
	if output.ExitCode != 2 || strings.Contains(output.Stdout, "fixture-secret") || strings.Contains(output.Stderr, "fixture-token") {
		t.Fatalf("exit or secret leak: %#v", output)
	}
	if !strings.Contains(output.Stdout, "api_key=[redacted]") || !strings.Contains(output.Stderr, "authorization=[redacted]") {
		t.Fatalf("redaction missing: %#v", output)
	}
}

func TestQueryRejectsBeforeExecution(t *testing.T) {
	called := false
	tool := &MonitorTool{
		bin: "bk-cli",
		run: func(context.Context, string, []string) ([]byte, []byte, int, error) {
			called = true
			return nil, nil, 0, nil
		},
	}
	_, err := tool.Query(context.Background(), MonitorInput{Args: []string{"update"}})
	if err == nil || called {
		t.Fatal("mutating command reached the binary")
	}
}

func TestQueryTruncatesLargeOutput(t *testing.T) {
	dir := t.TempDir()
	tool := &MonitorTool{
		bin: "bk-cli",
		dir: dir,
		run: func(context.Context, string, []string) ([]byte, []byte, int, error) {
			return []byte(strings.Repeat("x", inlineLimit+10)), nil, 0, nil
		},
	}
	output, err := tool.Query(context.Background(), MonitorInput{Args: []string{"monitor", "--help"}})
	if err != nil {
		t.Fatal(err)
	}
	if !output.Truncated || output.SavedTo == "" || len(output.Stdout) > previewLimit+len("\n[truncated]") {
		t.Fatalf("output was not truncated: %#v", output)
	}
	info, err := os.Stat(output.SavedTo)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("saved output mode = %o", info.Mode().Perm())
	}
	body, err := os.ReadFile(output.SavedTo)
	if err != nil || !strings.Contains(string(body), strings.Repeat("x", inlineLimit)) {
		t.Fatal("saved output lost the payload")
	}
}

func TestQueryHonorsCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	tool := &MonitorTool{
		bin: "bk-cli",
		run: func(ctx context.Context, _ string, _ []string) ([]byte, []byte, int, error) {
			return nil, nil, 0, ctx.Err()
		},
	}
	_, err := tool.Query(ctx, MonitorInput{Args: []string{"version"}})
	if err == nil {
		t.Fatal("expected cancel")
	}
}
