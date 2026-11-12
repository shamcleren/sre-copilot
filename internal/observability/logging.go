package observability

import (
	"io"
	"log/slog"
	"sync"

	"go.uber.org/zap"
	frameworklog "trpc.group/trpc-go/trpc-agent-go/log"
)

func NewLogger(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, nil))
}

var silenceOnce sync.Once

// The SDK's default logs use stdout and can include provider response bodies.
// Our CLI uses explicit, content-free events instead. Configure before any run.
func SilenceFrameworkLogs() {
	silenceOnce.Do(func() {
		frameworklog.Default = zap.NewNop().Sugar()
		frameworklog.ContextDefault = frameworklog.Default
	})
}
