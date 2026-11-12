// Package changes is the write gate for alert plans.
// The model may propose a plan. Approval is recorded only by a user command
// or the local HTTP API, and execution checks that record before writing.
package changes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

const (
	operationAlertCreate = "alert.create"
	diffAdd              = "add"
	diffNone             = "none"
	statusDraft          = "DRAFT"
	statusAwaiting       = "AWAITING_APPROVAL"
	statusReady          = "READY"
	statusSucceeded      = "SUCCEEDED"
	statusFailed         = "FAILED"
)

var (
	namePattern        = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)
	placeholderPattern = regexp.MustCompile(`<[^<>\s][^<>]*>`)
)

// AlertInput is the user-facing request to create one alert rule.
type AlertInput struct {
	Service       string  `json:"service"`
	AlertName     string  `json:"alert_name"`
	Query         string  `json:"query"`
	Threshold     float64 `json:"threshold"`
	WindowMinutes int     `json:"window_minutes"`
}

// Rule is the desired or current alert rule.
type Rule struct {
	Service       string  `json:"service"`
	Name          string  `json:"name"`
	Query         string  `json:"query"`
	Threshold     float64 `json:"threshold"`
	WindowMinutes int     `json:"window_minutes"`
	Enabled       bool    `json:"enabled"`
}

// Diff is the only change v0 can describe.
type Diff struct {
	Kind    string `json:"kind"`
	Summary string `json:"summary"`
}

// Plan is an immutable proposal. Its hash covers the fields that approval binds.
type Plan struct {
	ID        string     `json:"id"`
	Operation string     `json:"operation"`
	Input     AlertInput `json:"input"`
	Current   *Rule      `json:"current"`
	Desired   Rule       `json:"desired"`
	Diff      Diff       `json:"diff"`
	Status    string     `json:"status"`
	PlanHash  string     `json:"plan_hash"`
}

// Approval binds an actor to one plan hash.
type Approval struct {
	ID       string `json:"id"`
	PlanID   string `json:"plan_id"`
	PlanHash string `json:"plan_hash"`
	ActorID  string `json:"actor_id"`
}

// AuditEvent is a user-visible step in a plan's history.
type AuditEvent struct {
	Type    string `json:"type"`
	PlanID  string `json:"plan_id"`
	Message string `json:"message"`
}

// Execution is the result of an attempt to apply a plan.
type Execution struct {
	Status  string       `json:"status"`
	Summary string       `json:"summary"`
	Audit   []AuditEvent `json:"audit"`
}

func validateInput(input AlertInput) error {
	if !namePattern.MatchString(input.Service) {
		return errors.New("service must be a lowercase DNS label")
	}
	if !namePattern.MatchString(input.AlertName) {
		return errors.New("alert_name must be a lowercase DNS label")
	}
	query := strings.TrimSpace(input.Query)
	if query == "" || len(query) > 2000 || strings.ContainsAny(query, "\r\n") || placeholderPattern.MatchString(query) {
		return errors.New("query must be a single line without angle-bracket placeholders")
	}
	if input.Threshold <= 0 {
		return errors.New("threshold must be positive")
	}
	if input.WindowMinutes < 1 || input.WindowMinutes > 1440 {
		return errors.New("window_minutes must be from 1 to 1440")
	}
	return nil
}

func buildRule(input AlertInput) Rule {
	return Rule{
		Service:       input.Service,
		Name:          input.AlertName,
		Query:         strings.TrimSpace(input.Query),
		Threshold:     input.Threshold,
		WindowMinutes: input.WindowMinutes,
		Enabled:       true,
	}
}

func summarize(current *Rule, desired Rule) Diff {
	if current == nil {
		return Diff{Kind: diffAdd, Summary: "create alert " + desired.Service + "/" + desired.Name}
	}
	return Diff{Kind: diffNone, Summary: "alert " + desired.Service + "/" + desired.Name + " already exists and will not be changed"}
}

func hashPlan(operation string, input AlertInput, desired Rule, diff Diff) (string, error) {
	body, err := json.Marshal(struct {
		Operation string     `json:"operation"`
		Input     AlertInput `json:"input"`
		Desired   Rule       `json:"desired"`
		Diff      Diff       `json:"diff"`
	}{operation, input, desired, diff})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:]), nil
}

func decision(diff Diff) string {
	if diff.Kind == diffAdd {
		return statusAwaiting
	}
	return statusReady
}

func ruleKey(service, name string) string {
	return service + "\x00" + name
}

func sameRule(left, right Rule) bool {
	return left == right
}
