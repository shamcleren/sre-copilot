package changes

import (
	"strings"
	"testing"
)

func demoInput() AlertInput {
	return AlertInput{
		Service: "demo-service", AlertName: "http-5xx-rate",
		Query:     `http_requests_total{service="demo-service",status=~"5.."}`,
		Threshold: 0.05, WindowMinutes: 5,
	}
}

func TestAddPlanRequiresApprovalAndVerifies(t *testing.T) {
	store := Open(t.TempDir())
	plan, err := store.Propose(demoInput())
	if err != nil {
		t.Fatal(err)
	}
	if plan.Diff.Kind != diffAdd || plan.Status != statusAwaiting || plan.PlanHash == "" {
		t.Fatalf("plan = %#v", plan)
	}
	if _, err := store.Execute(plan.ID); err == nil || !strings.Contains(err.Error(), "approval required") {
		t.Fatal("execute without approval must fail before writing")
	}
	approval, err := store.Approve(plan.ID, "oncall")
	if err != nil || approval.PlanHash != plan.PlanHash {
		t.Fatal(err)
	}
	result, err := store.Execute(plan.ID)
	if err != nil || result.Status != statusSucceeded {
		t.Fatalf("execute = %#v %v", result, err)
	}
	again, err := store.Propose(demoInput())
	if err != nil || again.Diff.Kind != diffNone {
		t.Fatalf("second plan = %#v %v", again, err)
	}
	noop, err := store.Execute(again.ID)
	if err != nil || noop.Status != statusSucceeded {
		t.Fatal("existing rule must stay unchanged without another approval")
	}
}

func TestVerificationFailureDoesNotReportSuccess(t *testing.T) {
	store := Open(t.TempDir())
	store.fault = "drop-after-create"
	plan, err := store.Propose(demoInput())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(plan.ID, "oncall"); err != nil {
		t.Fatal(err)
	}
	result, err := store.Execute(plan.ID)
	if err != nil || result.Status != statusFailed || strings.Contains(result.Summary, statusSucceeded) {
		t.Fatalf("result = %#v %v", result, err)
	}
	stored, err := store.Plan(plan.ID)
	if err != nil || stored.Status != statusFailed {
		t.Fatal(stored, err)
	}
}

func TestApprovalRejectsEmptyActorAndUnknownPlan(t *testing.T) {
	store := Open(t.TempDir())
	if _, err := store.Approve("missing", "oncall"); err == nil {
		t.Fatal("missing plan was approved")
	}
	plan, err := store.Propose(demoInput())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(plan.ID, "  "); err == nil {
		t.Fatal("blank actor was accepted")
	}
}

func TestProposeRejectsPlaceholderQuery(t *testing.T) {
	input := demoInput()
	input.Query = "rate(<metric>[5m])"
	if _, err := Open(t.TempDir()).Propose(input); err == nil {
		t.Fatal("placeholder query was accepted")
	}
}
