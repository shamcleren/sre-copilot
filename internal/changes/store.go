package changes

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// Store persists plans, approvals, and alert rules in one local file.
type Store struct {
	dir   string
	fault string
}

// Open returns a store. An empty dir uses .sre-copilot in the working directory.
func Open(dir string) *Store {
	if dir == "" {
		dir = ".sre-copilot"
	}
	return &Store{dir: dir}
}

type snapshot struct {
	Rules     map[string]Rule `json:"rules"`
	Plans     map[string]Plan `json:"plans"`
	Approvals []Approval      `json:"approvals"`
	Audits    []AuditEvent    `json:"audits"`
}

func (s *snapshot) normalize() {
	if s.Rules == nil {
		s.Rules = map[string]Rule{}
	}
	if s.Plans == nil {
		s.Plans = map[string]Plan{}
	}
}

// Propose records a plan. An existing rule produces a no-op plan and is not overwritten.
func (s *Store) Propose(input AlertInput) (Plan, error) {
	if err := validateInput(input); err != nil {
		return Plan{}, err
	}
	var plan Plan
	err := s.update(func(state *snapshot) error {
		desired := buildRule(input)
		var current *Rule
		if found, ok := state.Rules[ruleKey(desired.Service, desired.Name)]; ok {
			copy := found
			current = &copy
		}
		diff := summarize(current, desired)
		sum, err := hashPlan(operationAlertCreate, input, desired, diff)
		if err != nil {
			return err
		}
		id, err := newID("plan_")
		if err != nil {
			return err
		}
		plan = Plan{
			ID: id, Operation: operationAlertCreate, Input: input, Current: current,
			Desired: desired, Diff: diff, Status: decision(diff), PlanHash: sum,
		}
		state.Plans[plan.ID] = plan
		state.Audits = append(state.Audits, AuditEvent{Type: "PLAN_CREATED", PlanID: plan.ID, Message: diff.Summary})
		return nil
	})
	return plan, err
}

// Approve records a user's confirmation for the plan's current hash.
func (s *Store) Approve(planID, actorID string) (Approval, error) {
	actorID = trimActor(actorID)
	if actorID == "" {
		return Approval{}, errors.New("actor_id is required")
	}
	var approval Approval
	err := s.update(func(state *snapshot) error {
		plan, ok := state.Plans[planID]
		if !ok {
			return errors.New("plan not found")
		}
		if plan.Status != statusAwaiting && plan.Status != statusReady {
			return errors.New("plan cannot be approved")
		}
		for _, existing := range state.Approvals {
			if existing.PlanID == plan.ID && existing.PlanHash == plan.PlanHash && existing.ActorID == actorID {
				approval = existing
				return nil
			}
		}
		id, err := newID("apr_")
		if err != nil {
			return err
		}
		approval = Approval{ID: id, PlanID: plan.ID, PlanHash: plan.PlanHash, ActorID: actorID}
		state.Approvals = append(state.Approvals, approval)
		plan.Status = statusReady
		state.Plans[plan.ID] = plan
		state.Audits = append(state.Audits, AuditEvent{Type: "APPROVED", PlanID: plan.ID, Message: "approved by " + actorID})
		return nil
	})
	return approval, err
}

// Execute applies an add plan only when a matching approval exists, then verifies the stored rule.
func (s *Store) Execute(planID string) (Execution, error) {
	var result Execution
	err := s.update(func(state *snapshot) error {
		plan, ok := state.Plans[planID]
		if !ok {
			return errors.New("plan not found")
		}
		if plan.Diff.Kind == diffNone {
			plan.Status = statusSucceeded
			state.Plans[plan.ID] = plan
			result = Execution{Status: statusSucceeded, Summary: plan.Diff.Summary, Audit: append([]AuditEvent(nil), state.auditsFor(plan.ID)...)}
			return nil
		}
		if !approved(state, plan) {
			return errors.New("approval required")
		}
		key := ruleKey(plan.Desired.Service, plan.Desired.Name)
		state.Rules[key] = plan.Desired
		state.Audits = append(state.Audits, AuditEvent{Type: "EXECUTED", PlanID: plan.ID, Message: "alert rule written"})
		if s.fault == "drop-after-create" {
			delete(state.Rules, key)
		}
		stored, ok := state.Rules[key]
		if !ok || !sameRule(stored, plan.Desired) {
			delete(state.Rules, key)
			plan.Status = statusFailed
			state.Plans[plan.ID] = plan
			state.Audits = append(state.Audits, AuditEvent{Type: "FAILED", PlanID: plan.ID, Message: "verification failed"})
			result = Execution{Status: statusFailed, Summary: "verification failed; the rule was not kept", Audit: append([]AuditEvent(nil), state.auditsFor(plan.ID)...)}
			return nil
		}
		plan.Status = statusSucceeded
		state.Plans[plan.ID] = plan
		state.Audits = append(state.Audits, AuditEvent{Type: "VERIFIED", PlanID: plan.ID, Message: "stored rule matches the plan"})
		result = Execution{Status: statusSucceeded, Summary: "alert rule verified", Audit: append([]AuditEvent(nil), state.auditsFor(plan.ID)...)}
		return nil
	})
	return result, err
}

// Plan returns one stored plan.
func (s *Store) Plan(id string) (Plan, error) {
	var plan Plan
	err := s.update(func(state *snapshot) error {
		found, ok := state.Plans[id]
		if !ok {
			return errors.New("plan not found")
		}
		plan = found
		return nil
	})
	return plan, err
}

func approved(state *snapshot, plan Plan) bool {
	for _, approval := range state.Approvals {
		if approval.PlanID == plan.ID && approval.PlanHash == plan.PlanHash {
			return true
		}
	}
	return false
}

func (s *snapshot) auditsFor(planID string) []AuditEvent {
	var out []AuditEvent
	for _, event := range s.Audits {
		if event.PlanID == planID {
			out = append(out, event)
		}
	}
	return out
}

func trimActor(actor string) string {
	return strings.TrimSpace(actor)
}

func (s *Store) update(fn func(*snapshot) error) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return errors.New("cannot create state directory")
	}
	path := filepath.Join(s.dir, "state.json")
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return errors.New("cannot open state file")
	}
	defer file.Close()
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX); err != nil {
		return errors.New("cannot lock state file")
	}
	defer syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
	info, err := file.Stat()
	if err != nil {
		return errors.New("cannot read state file")
	}
	state := &snapshot{}
	if info.Size() > 0 {
		decoder := json.NewDecoder(file)
		if err := decoder.Decode(state); err != nil {
			return errors.New("state file is unreadable")
		}
	}
	state.normalize()
	if err := fn(state); err != nil {
		return err
	}
	body, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return errors.New("cannot encode state")
	}
	if err := file.Truncate(0); err != nil {
		return errors.New("cannot rewrite state")
	}
	if _, err := file.Seek(0, 0); err != nil {
		return errors.New("cannot rewrite state")
	}
	if _, err := file.Write(body); err != nil {
		return errors.New("cannot rewrite state")
	}
	return file.Sync()
}

func newID(prefix string) (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", errors.New("cannot create id")
	}
	return prefix + hex.EncodeToString(raw[:]), nil
}
