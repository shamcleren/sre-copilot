// Package app wires the SDK. SRE diagnosis, retrieval and memory are not
// implemented here; those are the learning project's next steps.
package app

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shamcleren/sre-copilot/internal/config"
	"github.com/shamcleren/sre-copilot/internal/observability"
	"github.com/shamcleren/sre-copilot/internal/sretools"
	"trpc.group/trpc-go/trpc-agent-go/agent"
	"trpc.group/trpc-go/trpc-agent-go/agent/llmagent"
	"trpc.group/trpc-go/trpc-agent-go/model"
	"trpc.group/trpc-go/trpc-agent-go/model/openai"
	"trpc.group/trpc-go/trpc-agent-go/runner"
	"trpc.group/trpc-go/trpc-agent-go/skill"
)

var (
	ErrModelRequest = errors.New("model request failed; check endpoint, model, credentials and provider status")
	ErrEmptyAnswer  = errors.New("model returned no final text")
)

type Result struct {
	RunID         string
	Text          string
	Usage         model.Usage
	UsageReported bool
}

// Run uses a fresh in-memory session for each invocation. Timeout bounds the
// whole run, including any future tool loop, rather than each HTTP call alone.
func Run(parent context.Context, cfg config.Config, prompt string, logger *slog.Logger) (result Result, err error) {
	observability.SilenceFrameworkLogs()
	ctx, cancel := context.WithTimeout(parent, cfg.Timeout)
	defer cancel()
	result.RunID = uuid.NewString()
	logger = logger.With("run_id", result.RunID, "model", cfg.Model)
	started := time.Now()
	logger.InfoContext(ctx, "run.started")
	defer func() {
		logger.InfoContext(ctx, "run.completed", "status", status(err),
			"duration_ms", time.Since(started).Milliseconds(),
			"usage_reported", result.UsageReported,
			"prompt_tokens", result.Usage.PromptTokens,
			"completion_tokens", result.Usage.CompletionTokens,
			"total_tokens", result.Usage.TotalTokens)
	}()
	if strings.TrimSpace(prompt) == "" {
		return result, errors.New("prompt is required")
	}

	m := openai.New(cfg.Model, openai.WithAPIKey(cfg.APIKey), openai.WithBaseURL(cfg.BaseURL),
		openai.WithHTTPClientOptions(openai.WithHTTPClientTimeout(cfg.Timeout)))
	skillsEnabled := cfg.SkillsRoot != ""
	agentOpts := []llmagent.Option{
		llmagent.WithModel(m),
		llmagent.WithGenerationConfig(model.GenerationConfig{Stream: false}),
		llmagent.WithMaxLLMCalls(cfg.MaxLLMCalls),
		llmagent.WithMaxToolIterations(cfg.MaxLLMCalls),
		llmagent.WithModelCallbacks(modelCallbacks(logger)),
		llmagent.WithTools(sretools.Registry(cfg.BKCLIPath)),
		llmagent.WithInstruction(sretools.Instruction(skillsEnabled)),
	}
	if skillsEnabled {
		repo, repoErr := skill.NewFSRepository(cfg.SkillsRoot)
		if repoErr != nil {
			return result, errors.New("cannot read skills root")
		}
		agentOpts = append(agentOpts,
			llmagent.WithSkills(repo),
			llmagent.WithSkillToolProfile(llmagent.SkillToolProfileKnowledgeOnly),
			llmagent.WithMaxLoadedSkills(1),
		)
	}
	a := llmagent.New("sre-copilot", agentOpts...)
	r := runner.NewRunner("sre-copilot", a)
	defer r.Close()
	events, runErr := r.Run(ctx, "local-user", result.RunID,
		model.NewUserMessage(prompt), agent.WithRequestID(result.RunID))
	if runErr != nil {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		return result, ErrModelRequest
	}

	seenUsage := map[string]bool{}
	failed := false
	// Drain through channel closure: a Done event is not necessarily the last
	// framework event. Early exit could leave a producer blocked.
	for e := range events {
		if e == nil {
			continue
		}
		logger.InfoContext(ctx, "agent.event", "event_id", e.ID,
			"invocation_id", e.InvocationID, "author", e.Author)
		if e.Response == nil {
			continue
		}
		if e.Error != nil {
			failed = true
			continue
		}
		if e.Object != model.ObjectTypeChatCompletion || e.IsPartial {
			continue
		}
		usageID := e.Response.ID
		if usageID == "" {
			usageID = e.ID
		}
		// The framework may attach timing to a synthetic zero-valued Usage
		// even when the provider omitted token counts. Keep that unknown.
		hasTokens := e.Usage != nil && (e.Usage.PromptTokens > 0 || e.Usage.CompletionTokens > 0 || e.Usage.TotalTokens > 0)
		if hasTokens && !seenUsage[usageID] {
			seenUsage[usageID] = true
			result.UsageReported = true
			result.Usage.PromptTokens += e.Usage.PromptTokens
			result.Usage.CompletionTokens += e.Usage.CompletionTokens
			result.Usage.TotalTokens += e.Usage.TotalTokens
		}
		if len(e.Choices) > 0 {
			message := e.Choices[0].Message
			if message.Role == model.RoleAssistant && len(message.ToolCalls) == 0 {
				result.Text = message.Content
			}
		}
	}
	if ctx.Err() != nil {
		return result, ctx.Err()
	}
	if failed {
		return result, ErrModelRequest
	}
	if strings.TrimSpace(result.Text) == "" {
		return result, ErrEmptyAnswer
	}
	return result, nil
}

type callKey struct{}
type callState struct {
	id      string
	started time.Time
}

func modelCallbacks(logger *slog.Logger) *model.Callbacks {
	callbacks := model.NewCallbacks()
	callbacks.RegisterBeforeModel(model.BeforeModelCallbackStructured(
		func(ctx context.Context, args *model.BeforeModelArgs) (*model.BeforeModelResult, error) {
			call := callState{id: uuid.NewString(), started: time.Now()}
			logger.InfoContext(ctx, "model.started", "call_id", call.id,
				"message_count", len(args.Request.Messages))
			return &model.BeforeModelResult{Context: context.WithValue(ctx, callKey{}, call)}, nil
		}))
	callbacks.RegisterAfterModel(model.AfterModelCallbackStructured(
		func(ctx context.Context, args *model.AfterModelArgs) (*model.AfterModelResult, error) {
			call, _ := ctx.Value(callKey{}).(callState)
			outcome := "ok"
			if args.Error != nil || (args.Response != nil && args.Response.Error != nil) {
				outcome = "error"
			}
			if ctx.Err() != nil {
				outcome = status(ctx.Err())
			}
			logger.InfoContext(ctx, "model.completed", "call_id", call.id, "status", outcome,
				"duration_ms", time.Since(call.started).Milliseconds())
			return nil, nil
		}))
	return callbacks
}

func status(err error) string {
	switch {
	case err == nil:
		return "ok"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, context.Canceled):
		return "canceled"
	default:
		return "error"
	}
}
