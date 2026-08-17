package system

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/ryanbekhen/dermaga/internal/cli"
	"github.com/ryanbekhen/dermaga/internal/notify"
)

// SystemStatus describes the `container` services themselves. Without them
// running, nothing else in the app can work, so the UI surfaces this first.
type Status struct {
	Status           string `json:"status"`
	Running          bool   `json:"running"`
	APIServerVersion string `json:"apiServerVersion,omitempty"`
	CLIVersion       string `json:"cliVersion,omitempty"`
	APIServerBuild   string `json:"apiServerBuild,omitempty"`
	AppRoot          string `json:"appRoot,omitempty"`
	InstallRoot      string `json:"installRoot,omitempty"`
	LogRoot          string `json:"logRoot,omitempty"`
}

type cliStatus struct {
	Status           string `json:"status"`
	APIServerVersion string `json:"apiServerVersion"`
	APIServerBuild   string `json:"apiServerBuild"`
	APIServerAppName string `json:"apiServerAppName"`
	AppRoot          string `json:"appRoot"`
	InstallRoot      string `json:"installRoot"`
	LogRoot          string `json:"logRoot"`
}

// DiskUsage is `container system df`: what each resource type costs on disk and
// how much of it could be reclaimed.
type DiskUsage struct {
	Containers UsageEntry `json:"containers"`
	Images     UsageEntry `json:"images"`
	Volumes    UsageEntry `json:"volumes"`
}

type UsageEntry struct {
	Total            int   `json:"total"`
	Active           int   `json:"active"`
	SizeInBytes      int64 `json:"sizeInBytes"`
	ReclaimableBytes int64 `json:"reclaimable"`
}

type Manager struct {
	runner  *cli.Runner
	logger  *slog.Logger
	changed notify.Notifier
}

func NewManager(runner *cli.Runner, logger *slog.Logger, changed notify.Notifier) *Manager {
	return &Manager{runner: runner, logger: logger, changed: changed}
}

// cliVersionPattern pulls "1.2.2" out of
// "container CLI version 1.2.2 (build: release, commit: unspecified)".
var cliVersionPattern = regexp.MustCompile(`version\s+(\S+)`)

// CLIVersion reports the installed `container` CLI version, empty if it is not
// on PATH. The status bar shows it so a version mismatch is visible at a glance.
func (sm *Manager) CLIVersion(ctx context.Context) string {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	output, err := sm.runner.Run(ctx, "--version")
	if err != nil {
		return ""
	}

	if match := cliVersionPattern.FindSubmatch(output); len(match) == 2 {
		return string(match[1])
	}

	return strings.TrimSpace(string(output))
}

func (sm *Manager) Status(ctx context.Context) (*Status, error) {
	cliVersion := sm.CLIVersion(ctx)

	output, err := sm.runner.Run(ctx, "system", "status", "--format", "json")
	if err != nil {
		// A stopped apiserver makes the command fail rather than report
		// "stopped", which is itself the answer the UI needs.
		return &Status{Status: "stopped", Running: false, CLIVersion: cliVersion}, nil
	}

	var raw cliStatus
	if err := json.Unmarshal(output, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse system status: %w", err)
	}

	status := strings.ToLower(raw.Status)

	return &Status{
		Status:           status,
		Running:          status == "running",
		APIServerVersion: raw.APIServerVersion,
		CLIVersion:       cliVersion,
		APIServerBuild:   raw.APIServerBuild,
		AppRoot:          raw.AppRoot,
		InstallRoot:      raw.InstallRoot,
		LogRoot:          raw.LogRoot,
	}, nil
}

// Start brings the services up.
//
// `container system start` prompts before installing a default kernel, and a
// prompt would hang a request forever, so the answer is given up front. A
// generous timeout covers the kernel download that follows on a fresh install.
func (sm *Manager) Start(ctx context.Context, installKernel bool) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	flag := "--disable-kernel-install"
	if installKernel {
		flag = "--enable-kernel-install"
	}

	if _, err := sm.runner.Run(ctx, "system", "start", flag); err != nil {
		sm.logger.Error("Failed to start system services", "error", err)
		return err
	}

	sm.changed.Changed()

	return nil
}

func (sm *Manager) Stop(ctx context.Context) error {
	if _, err := sm.runner.Run(ctx, "system", "stop"); err != nil {
		sm.logger.Error("Failed to stop system services", "error", err)
		return err
	}

	sm.changed.Changed()

	return nil
}

func (sm *Manager) DiskUsage(ctx context.Context) (*DiskUsage, error) {
	output, err := sm.runner.Run(ctx, "system", "df", "--format", "json")
	if err != nil {
		return nil, err
	}

	var usage DiskUsage
	if err := json.Unmarshal(output, &usage); err != nil {
		return nil, fmt.Errorf("failed to parse disk usage: %w", err)
	}

	return &usage, nil
}

// StreamLogs follows the services' own logs, which is where to look when a
// container refuses to start for no visible reason.
func (sm *Manager) LogsCommand(ctx context.Context, last string, follow bool) *exec.Cmd {
	args := []string{"system", "logs"}
	if follow {
		args = append(args, "--follow")
	}
	if last != "" {
		args = append(args, "--last", last)
	}

	return sm.runner.Command(ctx, args...)
}

// Prune reclaims space across every resource type that supports it. Each is
// best-effort: one failure should not hide the space the others freed.
func (sm *Manager) Prune(ctx context.Context) []string {
	var failures []string

	for _, target := range [][]string{
		{"prune"},
		{"image", "prune"},
		{"volume", "prune"},
		{"network", "prune"},
	} {
		if _, err := sm.runner.Run(ctx, target...); err != nil {
			sm.logger.Debug("Prune step failed", "target", target, "error", err)
			failures = append(failures, strings.Join(target, " "))
		}
	}

	sm.changed.Changed()

	return failures
}
