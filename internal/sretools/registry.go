// Package sretools registers the observation tools used by the single agent loop.
package sretools

import (
	"trpc.group/trpc-go/trpc-agent-go/tool"

	"github.com/shamcleren/sre-copilot/internal/changes"
)

// Registry returns the read-only monitor command and the alert write gate.
// bin may be empty to resolve bk-cli from PATH. stateDir stores plans and approvals.
func Registry(bin, stateDir string) []tool.Tool {
	tools := []tool.Tool{NewMonitorTool(bin).Tool()}
	return append(tools, changes.Tools(stateDir)...)
}
