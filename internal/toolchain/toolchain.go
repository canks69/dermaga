// Package toolchain looks after the `container` CLI itself: whether it is
// installed, whether a newer release is available, and installing or upgrading
// it without leaving the app.
//
// Only the Homebrew formula is managed. A CLI installed from Apple's .pkg is
// reported as such and left alone, because upgrading that means an installer
// asking for an admin password -- not something to run behind the user's back.
package toolchain

import (
	"context"
	"encoding/json"
	"log/slog"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/ryanbekhen/dermaga/internal/cli"
)

// Formula is the Homebrew name of Apple's CLI.
const Formula = "container"

// How it got onto the machine, which decides what Dermaga may do about it.
const (
	ManagedByHomebrew = "homebrew"
	ManagedManually   = "manual"
)

type Status struct {
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	// "homebrew", "manual", or empty when not installed.
	ManagedBy       string `json:"managedBy,omitempty"`
	BrewAvailable   bool   `json:"brewAvailable"`
	UpdateAvailable bool   `json:"updateAvailable"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	// Set when the update check could not run, so the UI can stay quiet about
	// updates rather than claiming everything is current.
	CheckError string `json:"checkError,omitempty"`
}

type Manager struct {
	runner *cli.Runner
	logger *slog.Logger
}

func NewManager(runner *cli.Runner, logger *slog.Logger) *Manager {
	return &Manager{runner: runner, logger: logger}
}

// versionPattern pulls "1.2.2" out of
// "container CLI version 1.2.2 (build: release, commit: unspecified)".
var versionPattern = regexp.MustCompile(`version\s+(\S+)`)

func (m *Manager) Status(ctx context.Context) Status {
	status := Status{
		Installed:     m.runner.Available(),
		BrewAvailable: m.runner.Has("brew"),
	}

	if status.Installed {
		status.Version = m.version(ctx)
		status.ManagedBy = ManagedManually
	}

	if !status.BrewAvailable {
		return status
	}

	// Homebrew knows the formula only if it installed it.
	if status.Installed && m.installedByBrew(ctx) {
		status.ManagedBy = ManagedByHomebrew
	}

	if status.ManagedBy == ManagedByHomebrew {
		outdated, latest, err := m.outdated(ctx)
		if err != nil {
			status.CheckError = err.Error()
		} else {
			status.UpdateAvailable = outdated
			status.LatestVersion = latest
		}
	}

	if !status.Installed {
		status.LatestVersion = m.stableVersion(ctx)
	}

	return status
}

func (m *Manager) version(ctx context.Context) string {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	output, err := m.runner.Run(ctx, "--version")
	if err != nil {
		return ""
	}

	if match := versionPattern.FindSubmatch(output); len(match) == 2 {
		return string(match[1])
	}

	return strings.TrimSpace(string(output))
}

func (m *Manager) installedByBrew(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	output, err := m.runner.RunTool(ctx, "brew", "list", "--formula", "--versions", Formula)

	return err == nil && strings.Contains(string(output), Formula)
}

// outdated asks Homebrew what it already knows. It deliberately does not run
// `brew update` first: that is slow, touches the user's Homebrew state, and
// Homebrew refreshes its index on its own schedule.
func (m *Manager) outdated(ctx context.Context) (bool, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	output, err := m.runner.RunTool(ctx, "brew", "outdated", "--json=v2", Formula)
	if err != nil {
		return false, "", err
	}

	var report struct {
		Formulae []struct {
			Name           string `json:"name"`
			CurrentVersion string `json:"current_version"`
		} `json:"formulae"`
	}
	if err := json.Unmarshal(output, &report); err != nil {
		return false, "", err
	}

	for _, formula := range report.Formulae {
		if formula.Name == Formula {
			return true, formula.CurrentVersion, nil
		}
	}

	return false, "", nil
}

func (m *Manager) stableVersion(ctx context.Context) string {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	output, err := m.runner.RunTool(ctx, "brew", "info", "--json=v2", Formula)
	if err != nil {
		return ""
	}

	var report struct {
		Formulae []struct {
			Versions struct {
				Stable string `json:"stable"`
			} `json:"versions"`
		} `json:"formulae"`
	}
	if err := json.Unmarshal(output, &report); err != nil || len(report.Formulae) == 0 {
		return ""
	}

	return report.Formulae[0].Versions.Stable
}

// InstallCommand and UpgradeCommand are streamed: a formula install can take
// minutes and prints its own progress.
func (m *Manager) InstallCommand(ctx context.Context) *exec.Cmd {
	return m.runner.Tool(ctx, "brew", "install", Formula)
}

func (m *Manager) UpgradeCommand(ctx context.Context) *exec.Cmd {
	return m.runner.Tool(ctx, "brew", "upgrade", Formula)
}
