package changes

import (
	"context"
	"errors"

	"trpc.group/trpc-go/trpc-agent-go/tool"
	"trpc.group/trpc-go/trpc-agent-go/tool/function"
)

// ProposeInput is the model-facing alert proposal.
type ProposeInput struct {
	Service       string  `json:"service"`
	AlertName     string  `json:"alert_name"`
	Query         string  `json:"query"`
	Threshold     float64 `json:"threshold"`
	WindowMinutes int     `json:"window_minutes"`
}

// ExecuteInput selects a plan. It carries no actor and cannot approve the plan.
type ExecuteInput struct {
	PlanID string `json:"plan_id"`
}

// Tools returns the model-facing write tools. Approval is intentionally absent.
func Tools(dir string) []tool.Tool {
	store := Open(dir)
	propose := function.NewFunctionTool(func(_ context.Context, input ProposeInput) (Plan, error) {
		return store.Propose(AlertInput(input))
	}, function.WithName("propose_alert_plan"), function.WithConcurrencySafe(false),
		function.WithDescription("Propose a read-only alert plan. This does not create the alert. An add plan stays blocked until a person approves it outside the model."))
	execute := function.NewFunctionTool(func(_ context.Context, input ExecuteInput) (Execution, error) {
		if input.PlanID == "" {
			return Execution{}, errors.New("plan_id is required")
		}
		return store.Execute(input.PlanID)
	}, function.WithName("execute_alert_plan"), function.WithConcurrencySafe(false),
		function.WithDescription("Execute a previously proposed alert plan. Add plans fail with approval required until a person has approved that exact plan hash."))
	return []tool.Tool{propose, execute}
}
