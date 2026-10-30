package cli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/shamcleren/sre-copilot/internal/app"
	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/observability"
)

func Execute(ctx context.Context, args []string, stdout, stderr io.Writer, lookup func(string) (string, bool)) int {
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
