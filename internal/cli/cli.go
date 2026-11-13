package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/shamcleren/sre-copilot/internal/app"
	"github.com/shamcleren/sre-copilot/internal/changes"
	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/httpapi"
	"github.com/shamcleren/sre-copilot/internal/observability"
)

func Execute(ctx context.Context, args []string, stdout, stderr io.Writer, lookup func(string) (string, bool)) int {
	if len(args) > 0 {
		switch args[0] {
		case "approve":
			return approve(args[1:], stdout, stderr, lookup)
		case "serve":
			return serve(ctx, args[1:], stdout, stderr, lookup)
		}
	}
	return run(ctx, args, stdout, stderr, lookup)
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer, lookup func(string) (string, bool)) int {
	flags := flag.NewFlagSet("sre-copilot", flag.ContinueOnError)
	flags.SetOutput(stderr)
	prompt := flags.String("prompt", "", "question for the model")
	envFile := flags.String("env-file", ".env", "optional local env file; exported variables take precedence")
	doctor := flags.Bool("doctor", false, "validate configuration without network requests")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "use --prompt for the question")
		return 2
	}
	cfg, err := config.Load(*envFile, lookup)
	if err != nil {
		fmt.Fprintln(stderr, "configuration_required:", err)
		return 2
	}
	if *doctor {
		fmt.Fprintln(stdout, "configuration_ready: endpoint, model and key are set; connectivity has not been tested")
		return 0
	}
	if strings.TrimSpace(*prompt) == "" {
		fmt.Fprintln(stderr, "--prompt is required (or use --doctor)")
		return 2
	}
	logger := observability.NewLogger(stderr)
	result, err := app.Run(ctx, cfg, *prompt, logger)
	if err != nil {
		fmt.Fprintln(stderr, "run failed:", err)
		return 1
	}
	if _, err := fmt.Fprintln(stdout, result.Text); err != nil {
		fmt.Fprintln(stderr, "cannot write answer")
		return 1
	}
	return 0
}

func approve(args []string, stdout, stderr io.Writer, lookup func(string) (string, bool)) int {
	flags := flag.NewFlagSet("approve", flag.ContinueOnError)
	flags.SetOutput(stderr)
	planID := flags.String("plan-id", "", "alert plan id")
	actor := flags.String("actor", "", "person confirming the plan")
	envFile := flags.String("env-file", ".env", "optional local env file")
	stateDir := flags.String("state-dir", "", "directory containing state.json")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	dir := *stateDir
	if dir == "" {
		cfg, err := config.Load(*envFile, lookup)
		if err != nil && !strings.Contains(err.Error(), "is required") && !strings.Contains(err.Error(), "LLM_BASE_URL") {
			fmt.Fprintln(stderr, "configuration_required:", err)
			return 2
		}
		if err == nil {
			dir = cfg.StateDir
		}
	}
	approval, err := changes.Open(dir).Approve(*planID, *actor)
	if err != nil {
		fmt.Fprintln(stderr, "approve failed:", err)
		return 1
	}
	fmt.Fprintf(stdout, "approved %s by %s\n", approval.PlanID, approval.ActorID)
	return 0
}

func serve(ctx context.Context, args []string, stdout, stderr io.Writer, lookup func(string) (string, bool)) int {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(stderr)
	addr := flags.String("addr", "127.0.0.1:3001", "listen address")
	envFile := flags.String("env-file", ".env", "optional local env file")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	cfg, err := config.Load(*envFile, lookup)
	if err != nil {
		fmt.Fprintln(stderr, "configuration_required:", err)
		return 2
	}
	if !loopback(*addr) && cfg.LocalAPIToken == "" {
		fmt.Fprintln(stderr, httpapi.ErrListen)
		return 2
	}
	server := &http.Server{Addr: *addr, Handler: httpapi.New(cfg, observability.NewLogger(stderr)), ReadHeaderTimeout: 5 * time.Second}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()
	fmt.Fprintln(stdout, "listening", *addr)
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		return 0
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintln(stderr, "serve failed:", err)
			return 1
		}
		return 0
	}
}

func loopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
