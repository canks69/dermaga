// Package images wraps `container image`.
package images

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"sort"
	"strings"

	"github.com/ryanbekhen/dermaga/internal/cli"
	"github.com/ryanbekhen/dermaga/internal/notify"
)

// Manager owns every image operation.
type Manager struct {
	runner  *cli.Runner
	logger  *slog.Logger
	changed notify.Notifier
}

func NewManager(runner *cli.Runner, logger *slog.Logger, changed notify.Notifier) *Manager {
	return &Manager{runner: runner, logger: logger, changed: changed}
}

// Image is the flattened view of `container image list --format json`.
type Image struct {
	Reference string   `json:"reference"`
	Name      string   `json:"name"`
	Tag       string   `json:"tag"`
	Digest    string   `json:"digest"`
	CreatedAt string   `json:"createdAt"`
	Platforms []string `json:"platforms"`
	// Sum of every variant's size, which is what the registry transferred.
	SizeInBytes int64 `json:"sizeInBytes"`
}

// ImageDetail is `container image inspect`: one entry per platform variant,
// each with the config a container inherits and the layer history.
type ImageDetail struct {
	Reference string         `json:"reference"`
	Name      string         `json:"name"`
	Tag       string         `json:"tag"`
	Digest    string         `json:"digest"`
	CreatedAt string         `json:"createdAt"`
	Variants  []ImageVariant `json:"variants"`
}

type ImageVariant struct {
	Platform     string            `json:"platform"`
	Digest       string            `json:"digest"`
	SizeInBytes  int64             `json:"sizeInBytes"`
	CreatedAt    string            `json:"createdAt"`
	Entrypoint   []string          `json:"entrypoint"`
	Command      []string          `json:"command"`
	Env          []string          `json:"env"`
	WorkingDir   string            `json:"workingDir,omitempty"`
	User         string            `json:"user,omitempty"`
	ExposedPorts []string          `json:"exposedPorts"`
	Labels       map[string]string `json:"labels"`
	Layers       int               `json:"layers"`
	History      []ImageHistory    `json:"history"`
}

type ImageHistory struct {
	CreatedAt  string `json:"createdAt"`
	CreatedBy  string `json:"createdBy"`
	Comment    string `json:"comment,omitempty"`
	EmptyLayer bool   `json:"emptyLayer,omitempty"`
}

type cliImage struct {
	ID            string `json:"id"`
	Configuration struct {
		Name         string `json:"name"`
		CreationDate string `json:"creationDate"`
		Descriptor   struct {
			Digest string `json:"digest"`
		} `json:"descriptor"`
	} `json:"configuration"`
	Variants []cliImageVariant `json:"variants"`
}

type cliImageVariant struct {
	Digest   string `json:"digest"`
	Size     int64  `json:"size"`
	Platform struct {
		Architecture string `json:"architecture"`
		OS           string `json:"os"`
		Variant      string `json:"variant"`
	} `json:"platform"`
	Config struct {
		Architecture string `json:"architecture"`
		OS           string `json:"os"`
		Created      string `json:"created"`
		Config       struct {
			Cmd          []string          `json:"Cmd"`
			Entrypoint   []string          `json:"Entrypoint"`
			Env          []string          `json:"Env"`
			WorkingDir   string            `json:"WorkingDir"`
			User         string            `json:"User"`
			Labels       map[string]string `json:"Labels"`
			ExposedPorts map[string]any    `json:"ExposedPorts"`
		} `json:"config"`
		RootFS struct {
			DiffIDs []string `json:"diff_ids"`
		} `json:"rootfs"`
		History []struct {
			Created    string `json:"created"`
			CreatedBy  string `json:"created_by"`
			Comment    string `json:"comment"`
			EmptyLayer bool   `json:"empty_layer"`
		} `json:"history"`
	} `json:"config"`
}

// platformOf prefers the manifest platform and falls back to the config, which
// is what single-platform images carry.
func (v cliImageVariant) platformOf() string {
	os, arch, suffix := v.Platform.OS, v.Platform.Architecture, v.Platform.Variant
	if os == "" {
		os = v.Config.OS
	}
	if arch == "" {
		arch = v.Config.Architecture
	}
	if os == "" && arch == "" {
		return ""
	}
	if suffix != "" {
		return fmt.Sprintf("%s/%s/%s", os, arch, suffix)
	}
	return fmt.Sprintf("%s/%s", os, arch)
}

func (m *Manager) List(ctx context.Context) ([]Image, error) {
	output, err := m.runner.Run(ctx, "image", "list", "--format", "json")
	if err != nil {
		return nil, err
	}

	return parse(output)
}

func parse(output []byte) ([]Image, error) {
	var raw []cliImage
	if err := json.Unmarshal(output, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse image list: %w", err)
	}

	images := make([]Image, 0, len(raw))
	for _, r := range raw {
		reference := r.Configuration.Name
		name, tag := splitReference(reference)

		platforms := make([]string, 0, len(r.Variants))
		seen := map[string]bool{}
		var size int64
		for _, v := range r.Variants {
			size += v.Size
			platform := v.platformOf()
			if platform == "" || seen[platform] {
				continue
			}
			seen[platform] = true
			platforms = append(platforms, platform)
		}

		images = append(images, Image{
			Reference:   reference,
			Name:        name,
			Tag:         tag,
			Digest:      strings.TrimPrefix(r.Configuration.Descriptor.Digest, "sha256:"),
			CreatedAt:   r.Configuration.CreationDate,
			Platforms:   platforms,
			SizeInBytes: size,
		})
	}

	return images, nil
}

// splitReference peels the tag off a reference without mistaking a registry
// port (host:5000/image) for one.
func splitReference(reference string) (string, string) {
	slash := strings.LastIndex(reference, "/")
	colon := strings.LastIndex(reference, ":")

	if colon > slash {
		return reference[:colon], reference[colon+1:]
	}

	return reference, "latest"
}

// InspectImage returns the full per-variant detail for one reference.
func (m *Manager) Inspect(ctx context.Context, reference string) (*ImageDetail, error) {
	output, err := m.runner.Run(ctx, "image", "inspect", reference)
	if err != nil {
		return nil, err
	}

	var raw []cliImage
	if err := json.Unmarshal(output, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse image inspect: %w", err)
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("image not found: %s", reference)
	}

	r := raw[0]
	name, tag := splitReference(r.Configuration.Name)

	variants := make([]ImageVariant, 0, len(r.Variants))
	for _, v := range r.Variants {
		ports := make([]string, 0, len(v.Config.Config.ExposedPorts))
		for port := range v.Config.Config.ExposedPorts {
			ports = append(ports, port)
		}
		sort.Strings(ports)

		history := make([]ImageHistory, 0, len(v.Config.History))
		for _, h := range v.Config.History {
			history = append(history, ImageHistory{
				CreatedAt:  h.Created,
				CreatedBy:  h.CreatedBy,
				Comment:    h.Comment,
				EmptyLayer: h.EmptyLayer,
			})
		}

		labels := v.Config.Config.Labels
		if labels == nil {
			labels = map[string]string{}
		}

		variants = append(variants, ImageVariant{
			Platform:     v.platformOf(),
			Digest:       strings.TrimPrefix(v.Digest, "sha256:"),
			SizeInBytes:  v.Size,
			CreatedAt:    v.Config.Created,
			Entrypoint:   cli.OrEmpty(v.Config.Config.Entrypoint),
			Command:      cli.OrEmpty(v.Config.Config.Cmd),
			Env:          cli.OrEmpty(v.Config.Config.Env),
			WorkingDir:   v.Config.Config.WorkingDir,
			User:         v.Config.Config.User,
			ExposedPorts: ports,
			Labels:       labels,
			Layers:       len(v.Config.RootFS.DiffIDs),
			History:      history,
		})
	}

	return &ImageDetail{
		Reference: r.Configuration.Name,
		Name:      name,
		Tag:       tag,
		Digest:    strings.TrimPrefix(r.Configuration.Descriptor.Digest, "sha256:"),
		CreatedAt: r.Configuration.CreationDate,
		Variants:  variants,
	}, nil
}

// PullImage builds the pull command. Progress is relayed to the client as an
// SSE stream, so the caller owns starting it.
func (m *Manager) PullCommand(ctx context.Context, reference, platform string) *exec.Cmd {
	args := []string{"image", "pull", "--progress", "plain"}
	if platform != "" {
		args = append(args, "--platform", platform)
	}
	args = append(args, reference)

	return m.runner.Command(ctx, args...)
}

func (m *Manager) Delete(ctx context.Context, reference string) error {
	if _, err := m.runner.Run(ctx, "image", "delete", reference); err != nil {
		m.logger.Error("Failed to delete image", "reference", reference, "error", err)
		return err
	}
	m.changed.Changed()

	return nil
}

func (m *Manager) Prune(ctx context.Context) error {
	if _, err := m.runner.Run(ctx, "image", "prune"); err != nil {
		m.logger.Error("Failed to prune images", "error", err)
		return err
	}
	m.changed.Changed()

	return nil
}
