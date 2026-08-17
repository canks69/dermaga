package system

import (
	"context"
	"strings"
	"testing"

	"github.com/ryanbekhen/dermaga/internal/cli"
)

// The kernel install has to be the exact command the CLI tells the user to run
// by hand; a fresh install cannot start the services without it.
func TestInstallKernelCommand(t *testing.T) {
	sm := NewManager(cli.New(), nil, nil)

	cmd := sm.InstallKernelCommand(context.Background())

	got := strings.Join(cmd.Args[1:], " ")
	if want := "system kernel set --recommended"; got != want {
		t.Fatalf("kernel install args = %q, want %q", got, want)
	}
}
