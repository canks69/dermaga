// Package cli runs Apple's `container` command. It is the only package that
// reaches for os/exec, so everything else can be tested against plain data.
package cli

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// Binary is the command every call goes through.
const Binary = "container"

type Runner struct{}

func New() *Runner {
	return &Runner{}
}

// Available reports whether the CLI is installed at all.
func (r *Runner) Available() bool {
	return r.Has(Binary)
}

// Command builds a command without running it, for callers that need to stream
// its output or attach it to a pty.
func (r *Runner) Command(ctx context.Context, args ...string) *exec.Cmd {
	return r.Tool(ctx, Binary, args...)
}

// Tool builds a command for a binary other than `container` -- Homebrew, when
// installing or updating the runtime itself.
func (r *Runner) Tool(ctx context.Context, binary string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, binary, args...)
}

// Has reports whether a binary is on PATH.
func (r *Runner) Has(binary string) bool {
	_, err := exec.LookPath(binary)
	return err == nil
}

// Run executes a subcommand and returns stdout. Stderr is folded into the error
// so the CLI's own diagnostics reach the user instead of "exit status 1".
func (r *Runner) Run(ctx context.Context, args ...string) ([]byte, error) {
	return r.RunTool(ctx, Binary, args...)
}

// RunTool is Run for a binary other than `container`.
func (r *Runner) RunTool(ctx context.Context, binary string, args ...string) ([]byte, error) {
	cmd := r.Tool(ctx, binary, args...)

	var stderr strings.Builder
	cmd.Stderr = &stderr

	stdout, err := cmd.Output()
	if err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return nil, fmt.Errorf("%s %s: %s", binary, strings.Join(args, " "), message)
		}
		return nil, fmt.Errorf("%s %s: %w", binary, strings.Join(args, " "), err)
	}

	return stdout, nil
}
