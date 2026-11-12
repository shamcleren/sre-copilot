// Package sretools registers the read-only BlueKing monitor command.
package sretools

import "trpc.group/trpc-go/trpc-agent-go/tool"

// Registry returns the only observation tool. bin may be empty to resolve bk-cli from PATH.
func Registry(bin string) []tool.Tool {
	return []tool.Tool{NewMonitorTool(bin).Tool()}
}
