// Package sretools is the learner-owned extension point.
package sretools

import "trpc.group/trpc-go/trpc-agent-go/tool"

// Registry is intentionally empty. First implement a read-only local tool,
// validate its input and cancellation, then register it here.
func Registry() []tool.Tool {
	return nil
}
