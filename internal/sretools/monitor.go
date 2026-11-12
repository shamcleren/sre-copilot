package sretools

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"trpc.group/trpc-go/trpc-agent-go/tool"
	"trpc.group/trpc-go/trpc-agent-go/tool/function"
)

const (
	monitorToolName = "bk_cli_monitor"
	inlineLimit     = 16 * 1024
	previewLimit    = 2 * 1024
)

// MonitorInput is the argv after the bk-cli binary. It is not a shell command.
type MonitorInput struct {
	Args []string `json:"args" description:"Arguments after bk-cli, for example [\"monitor\",\"log\",\"search_logs\",\"--help\"]. No shell syntax and no angle-bracket placeholders."`
}

// MonitorOutput returns the CLI result without treating an empty payload as success or failure by itself.
type MonitorOutput struct {
	ExitCode  int    `json:"exit_code"`
	Stdout    string `json:"stdout,omitempty"`
	Stderr    string `json:"stderr,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
	SavedTo   string `json:"saved_to,omitempty"`
}

type commandFunc func(ctx context.Context, name string, args []string) (stdout, stderr []byte, exitCode int, err error)

// MonitorTool runs allowlisted read-only bk-cli monitor commands.
type MonitorTool struct {
	bin string
	run commandFunc
	dir string
}

// NewMonitorTool returns the read-only bk-cli tool. An empty bin looks up bk-cli on PATH at call time.
func NewMonitorTool(bin string) *MonitorTool {
	return &MonitorTool{bin: bin, run: runCommand, dir: os.TempDir()}
}

// Tool adapts the command runner to the agent tool interface.
func (t *MonitorTool) Tool() tool.Tool {
	return function.NewFunctionTool(t.Query,
		function.WithName(monitorToolName),
		function.WithConcurrencySafe(false),
		function.WithDescription(monitorDescription),
	)
}

const monitorDescription = "Run a read-only bk-cli monitor command. " +
	"Use args as argv after the bk-cli binary, never a shell string. " +
	"Allowed shapes: version; monitor --help; monitor <module> --help; " +
	"monitor log|metric|alert|apm|analysis|dashboard|resource|space|status|tools <command>. " +
	"tools accepts only schema and search. " +
	"Refuses update, status --check_update, and mutating commands. " +
	"Check exit_code plus ok/error in the output. Empty output is not proof that nothing is wrong."

func (t *MonitorTool) Query(ctx context.Context, input MonitorInput) (MonitorOutput, error) {
	if err := validateMonitorArgs(input.Args); err != nil {
		return MonitorOutput{}, err
	}
	bin := t.bin
	if bin == "" {
		found, err := exec.LookPath("bk-cli")
		if err != nil {
			return MonitorOutput{}, errors.New("bk-cli is not installed")
		}
		bin = found
	}
	run := t.run
	if run == nil {
		run = runCommand
	}
	stdout, stderr, exitCode, err := run(ctx, bin, input.Args)
	if err != nil {
		if ctx.Err() != nil {
			return MonitorOutput{}, ctx.Err()
		}
		return MonitorOutput{}, errors.New("bk-cli failed to start")
	}
	output := MonitorOutput{
		ExitCode: exitCode,
		Stdout:   redactSecrets(string(stdout)),
		Stderr:   redactSecrets(string(stderr)),
	}
	return t.limit(output)
}

func validateMonitorArgs(args []string) error {
	if len(args) == 0 {
		return errors.New("args is required")
	}
	if len(args) > 64 {
		return errors.New("too many arguments")
	}
	for _, arg := range args {
		if err := validateMonitorArg(arg); err != nil {
			return err
		}
	}
	if args[0] == "update" {
		return errors.New("bk-cli update is not allowed")
	}
	if args[0] == "version" {
		if len(args) != 1 {
			return errors.New("version takes no arguments")
		}
		return nil
	}
	if args[0] != "monitor" {
		return errors.New("only bk-cli version and bk-cli monitor are allowed")
	}
	if hasCheckUpdate(args) {
		return errors.New("monitor status --check_update is not allowed")
	}
	if len(args) == 1 || (isHelpFlag(args[1]) && len(args) != 2) {
		return errors.New("monitor needs --help or one allowed module")
	}
	if isHelpFlag(args[1]) {
		return nil
	}
	if args[1] == "status" {
		for _, arg := range args[2:] {
			if mutatingMonitorCommands[arg] {
				return fmt.Errorf("read-only monitor rejects %s", arg)
			}
		}
		return nil
	}
	module := args[1]
	if !allowedMonitorModules[module] {
		return fmt.Errorf("monitor module %q is not allowed", module)
	}
	if len(args) == 2 || (isHelpFlag(args[2]) && len(args) != 3) {
		return errors.New("monitor module needs --help or a command")
	}
	if isHelpFlag(args[2]) {
		return nil
	}
	command := args[2]
	if mutatingMonitorCommands[command] {
		return fmt.Errorf("read-only monitor rejects %s", command)
	}
	if module == "tools" && command != "schema" && command != "search" {
		return errors.New("monitor tools only allows schema or search")
	}
	return nil
}

func validateMonitorArg(arg string) error {
	if arg == "" {
		return errors.New("argument is empty")
	}
	if len(arg) > 8000 {
		return errors.New("argument is too long")
	}
	if strings.ContainsAny(arg, "\x00\r\n") {
		return errors.New("argument contains a control character")
	}
	if strings.Contains(arg, "<") || strings.Contains(arg, ">") {
		return errors.New("replace angle-bracket placeholders before calling bk-cli")
	}
	return nil
}

func isHelpFlag(arg string) bool {
	return arg == "--help" || arg == "-h"
}

func hasCheckUpdate(args []string) bool {
	for _, arg := range args {
		if arg == "--check_update" || arg == "--check-update" {
			return true
		}
	}
	return false
}

var allowedMonitorModules = map[string]bool{
	"log": true, "metric": true, "alert": true, "apm": true,
	"analysis": true, "dashboard": true, "resource": true,
	"space": true, "tools": true,
}

var mutatingMonitorCommands = map[string]bool{
	"create": true, "update": true, "delete": true, "remove": true,
	"modify": true, "edit": true, "apply": true, "patch": true,
	"download": true, "upload": true, "extract": true, "claim": true,
	"execute": true, "enable": true, "disable": true, "ack": true,
	"acknowledge": true, "assign": true, "start": true, "stop": true,
	"restart": true, "install": true, "uninstall": true, "write": true,
	"set": true, "put": true,
}

var secretPattern = regexp.MustCompile(`(?i)(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\s*[:=]\s*\S+`)

func redactSecrets(text string) string {
	return secretPattern.ReplaceAllString(text, "$1=[redacted]")
}

func (t *MonitorTool) limit(output MonitorOutput) (MonitorOutput, error) {
	if len(output.Stdout)+len(output.Stderr) <= inlineLimit {
		return output, nil
	}
	dir := t.dir
	if dir == "" {
		dir = os.TempDir()
	}
	target := filepath.Join(dir, "sre-copilot-bkcli")
	if err := os.MkdirAll(target, 0o700); err != nil {
		return MonitorOutput{}, errors.New("cannot store large bk-cli output")
	}
	var name [8]byte
	if _, err := rand.Read(name[:]); err != nil {
		return MonitorOutput{}, errors.New("cannot store large bk-cli output")
	}
	path := filepath.Join(target, hex.EncodeToString(name[:])+".txt")
	body := "exit_code=" + fmt.Sprint(output.ExitCode) + "\n-- stdout --\n" + output.Stdout + "\n-- stderr --\n" + output.Stderr
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		return MonitorOutput{}, errors.New("cannot store large bk-cli output")
	}
	output.Truncated = true
	output.SavedTo = path
	output.Stdout = preview(output.Stdout)
	output.Stderr = preview(output.Stderr)
	return output, nil
}

func preview(text string) string {
	if len(text) <= previewLimit {
		return text
	}
	return text[:previewLimit] + "\n[truncated]"
}

func runCommand(ctx context.Context, name string, args []string) ([]byte, []byte, int, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = os.TempDir()
	cmd.Env = os.Environ()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		return stdout.Bytes(), stderr.Bytes(), 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return stdout.Bytes(), stderr.Bytes(), exitErr.ExitCode(), nil
	}
	return nil, nil, 0, err
}
