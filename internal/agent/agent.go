// Package agent wires the domain packages to the RPC surface. It is the only
// place that knows both what the app can do and how the UI asks for it.
package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"os/exec"
	"strings"

	"github.com/ryanbekhen/dermaga/internal/cli"
	"github.com/ryanbekhen/dermaga/internal/containers"
	"github.com/ryanbekhen/dermaga/internal/images"
	"github.com/ryanbekhen/dermaga/internal/machines"
	"github.com/ryanbekhen/dermaga/internal/networks"
	"github.com/ryanbekhen/dermaga/internal/rpc"
	"github.com/ryanbekhen/dermaga/internal/settings"
	"github.com/ryanbekhen/dermaga/internal/system"
	"github.com/ryanbekhen/dermaga/internal/terminal"
	"github.com/ryanbekhen/dermaga/internal/toolchain"
	"github.com/ryanbekhen/dermaga/internal/volumes"
	"github.com/ryanbekhen/dermaga/internal/watcher"
)

// Build is what this binary was cut from, reported to the UI.
type Build struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
	Date    string `json:"date,omitempty"`
}

type Agent struct {
	build   Build
	logger  *slog.Logger
	runner  *cli.Runner
	server  *rpc.Server
	streams *streams

	containers *containers.Manager
	images     *images.Manager
	volumes    *volumes.Manager
	networks   *networks.Manager
	machines   *machines.Manager
	system     *system.Manager
	toolchain  *toolchain.Manager
	settings   *settings.Store
	watcher    *watcher.Watcher
}

func New(server *rpc.Server, logger *slog.Logger) *Agent {
	runner := cli.New()

	agent := &Agent{
		logger:   logger,
		runner:   runner,
		server:   server,
		streams:  newStreams(server),
		settings: settings.NewStore(logger),
	}

	// The watcher is what "something changed" means, but the managers only see
	// the notify.Notifier side of it, so no domain package imports the watcher.
	var pending *watcher.Watcher
	changed := notifierFunc(func() {
		if pending != nil {
			pending.Changed()
		}
	})

	agent.containers = containers.NewManager(runner, logger, changed)
	agent.images = images.NewManager(runner, logger, changed)
	agent.volumes = volumes.NewManager(runner, logger, changed)
	agent.networks = networks.NewManager(runner, logger, changed)
	agent.machines = machines.NewManager(runner, logger, changed)
	agent.system = system.NewManager(runner, logger, changed)
	agent.toolchain = toolchain.NewManager(runner, logger)

	pending = watcher.New(watcher.Sources{
		Containers: func(ctx context.Context) ([]containers.Container, error) {
			return agent.containers.List(ctx, true)
		},
		Machines: agent.machines.List,
		Images:   agent.images.List,
		Volumes:  agent.volumes.List,
		Networks: agent.networks.List,
	}, logger)
	agent.watcher = pending

	return agent
}

type notifierFunc func()

func (f notifierFunc) Changed() { f() }

// Run starts the background work and serves requests until the client goes
// away, then tears down anything still streaming.
func (a *Agent) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go a.containers.Stats().Run(ctx)
	go a.watcher.Run(ctx)

	a.register()

	err := a.server.Serve(ctx)
	a.streams.closeAll()

	return err
}

// SetBuild records the version stamped into the binary at link time.
func (a *Agent) SetBuild(build Build) {
	a.build = build
}

func (a *Agent) register() {
	a.registerSystem()
	a.server.Register("app.info", func(_ context.Context, _ json.RawMessage) (any, error) {
		return a.build, nil
	})

	a.registerSettings()
	a.registerToolchain()
	a.registerContainers()
	a.registerImages()
	a.registerVolumes()
	a.registerNetworks()
	a.registerMachines()
	a.registerStreams()
}

// --- system ---------------------------------------------------------------

func (a *Agent) registerSystem() {
	a.server.Register("system.status", func(ctx context.Context, _ json.RawMessage) (any, error) {
		status, err := a.system.Status(ctx)
		if err != nil {
			return nil, err
		}

		// The renderer shows this alongside the service state.
		return map[string]any{"status": status, "cliAvailable": a.runner.Available()}, nil
	})

	a.server.Register("system.start", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			InstallKernel bool `json:"installKernel"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.system.Start(ctx, args.InstallKernel); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return a.system.Status(ctx)
	})

	a.server.Register("system.stop", func(ctx context.Context, _ json.RawMessage) (any, error) {
		if err := a.system.Stop(ctx); err != nil {
			return nil, rpc.Fail(err.Error())
		}
		return map[string]any{}, nil
	})

	a.server.Register("system.diskUsage", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.system.DiskUsage(ctx)
	})

	a.server.Register("system.prune", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.system.Prune(ctx), nil
	})
}

// --- toolchain ------------------------------------------------------------

func (a *Agent) registerToolchain() {
	a.server.Register("toolchain.status", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.toolchain.Status(ctx), nil
	})

	// A Mac that has never run a container has no Linux kernel, and the runtime
	// refuses to start until one is set. This is that fix, as one call.
	a.server.Register("system.installKernel", func(ctx context.Context, _ json.RawMessage) (any, error) {
		id, err := a.streams.runCommand(ctx, "kernel", func(ctx context.Context) (*exec.Cmd, error) {
			return a.system.InstallKernelCommand(ctx), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("toolchain.install", func(ctx context.Context, _ json.RawMessage) (any, error) {
		if !a.runner.Has("brew") {
			return nil, rpc.Fail("Homebrew is not installed, so Dermaga cannot install the CLI for you")
		}

		id, err := a.streams.runCommand(ctx, "install", func(ctx context.Context) (*exec.Cmd, error) {
			return a.toolchain.InstallCommand(ctx), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("toolchain.update", func(ctx context.Context, _ json.RawMessage) (any, error) {
		if !a.runner.Has("brew") {
			return nil, rpc.Fail("Homebrew is not installed, so Dermaga cannot update the CLI for you")
		}

		id, err := a.streams.runCommand(ctx, "update", func(ctx context.Context) (*exec.Cmd, error) {
			return a.toolchain.UpgradeCommand(ctx), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})
}

// --- settings -------------------------------------------------------------

func (a *Agent) registerSettings() {
	a.server.Register("settings.get", func(_ context.Context, _ json.RawMessage) (any, error) {
		return map[string]any{"settings": a.settings.Load(), "path": a.settings.Path()}, nil
	})

	a.server.Register("settings.save", func(_ context.Context, params json.RawMessage) (any, error) {
		// Merge onto what is stored so a partial update leaves the rest alone.
		current := a.settings.Load()
		if len(params) > 0 {
			if err := json.Unmarshal(params, &current); err != nil {
				return nil, &rpc.Error{Code: rpc.CodeInvalidParams, Message: err.Error()}
			}
		}

		saved, err := a.settings.Save(current)
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"settings": saved, "path": a.settings.Path()}, nil
	})
}

// --- containers -----------------------------------------------------------

func (a *Agent) registerContainers() {
	a.server.Register("containers.list", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			All *bool `json:"all"`
		}](params)
		if err != nil {
			return nil, err
		}

		all := args.All == nil || *args.All

		return a.containers.List(ctx, all)
	})

	a.server.Register("containers.get", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		return a.containers.Get(ctx, args.ID)
	})

	a.server.Register("containers.spec", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		container, err := a.containers.Get(ctx, args.ID)
		if err != nil {
			return nil, err
		}

		return containers.SpecOf(container), nil
	})

	a.server.Register("containers.start", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		return a.containers.Start(ctx, args.ID)
	})

	a.server.Register("containers.stop", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID      string `json:"id"`
			Timeout int    `json:"timeout"`
		}](params)
		if err != nil {
			return nil, err
		}

		if args.Timeout <= 0 {
			args.Timeout = 10
		}

		return a.containers.Stop(ctx, args.ID, args.Timeout)
	})

	a.server.Register("containers.remove", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID    string `json:"id"`
			Force bool   `json:"force"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.containers.Remove(ctx, args.ID, args.Force); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"id": args.ID}, nil
	})

	a.server.Register("containers.update", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID   string                   `json:"id"`
			Spec containers.ContainerSpec `json:"spec"`
		}](params)
		if err != nil {
			return nil, err
		}

		container, err := a.containers.Update(ctx, args.ID, args.Spec)
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return container, nil
	})

	// Creating streams: `container run` reports fetching, unpacking and
	// starting as it goes, and the UI shows those steps.
	a.server.Register("containers.create", func(ctx context.Context, params json.RawMessage) (any, error) {
		spec, err := decodeParams[containers.ContainerSpec](params)
		if err != nil {
			return nil, err
		}

		id, err := a.streams.runCommand(ctx, "create", func(ctx context.Context) (*exec.Cmd, error) {
			return a.containers.CreateCommand(ctx, spec)
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("containers.logs", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID     string `json:"id"`
			Tail   int    `json:"tail"`
			Follow *bool  `json:"follow"`
		}](params)
		if err != nil {
			return nil, err
		}

		follow := args.Follow == nil || *args.Follow

		id, err := a.streams.runCommand(ctx, "logs", func(ctx context.Context) (*exec.Cmd, error) {
			return a.containers.LogsCommand(ctx, args.ID, args.Tail, follow), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})
}

// --- images ---------------------------------------------------------------

func (a *Agent) registerImages() {
	a.server.Register("images.list", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.images.List(ctx)
	})

	a.server.Register("images.inspect", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Reference string `json:"reference"`
		}](params)
		if err != nil {
			return nil, err
		}

		return a.images.Inspect(ctx, args.Reference)
	})

	a.server.Register("images.pull", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Reference string `json:"reference"`
			Platform  string `json:"platform"`
		}](params)
		if err != nil {
			return nil, err
		}

		id, err := a.streams.runCommand(ctx, "pull", func(ctx context.Context) (*exec.Cmd, error) {
			return a.images.PullCommand(ctx, args.Reference, args.Platform), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("images.build", func(ctx context.Context, params json.RawMessage) (any, error) {
		opts, err := decodeParams[images.BuildOptions](params)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(opts.Context) == "" {
			return nil, rpc.Fail("a build needs a context directory")
		}

		id, err := a.streams.runCommand(ctx, "build", func(ctx context.Context) (*exec.Cmd, error) {
			return a.images.BuildCommand(ctx, opts), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	// Every build runs through a buildkit container, which does not exist until
	// something starts it. Asked before a build, this turns a confusing failure
	// into a step the UI can offer.
	a.server.Register("images.builderStatus", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.images.BuilderStatus(ctx), nil
	})

	a.server.Register("images.startBuilder", func(ctx context.Context, _ json.RawMessage) (any, error) {
		id, err := a.streams.runCommand(ctx, "builder", func(ctx context.Context) (*exec.Cmd, error) {
			return a.images.StartBuilderCommand(ctx), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("images.delete", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Reference string `json:"reference"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.images.Delete(ctx, args.Reference); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"reference": args.Reference}, nil
	})

	a.server.Register("images.prune", func(ctx context.Context, _ json.RawMessage) (any, error) {
		if err := a.images.Prune(ctx); err != nil {
			return nil, rpc.Fail(err.Error())
		}
		return map[string]any{}, nil
	})
}

// --- volumes and networks -------------------------------------------------

func (a *Agent) registerVolumes() {
	a.server.Register("volumes.list", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.volumes.List(ctx)
	})

	a.server.Register("volumes.create", func(ctx context.Context, params json.RawMessage) (any, error) {
		spec, err := decodeParams[volumes.Spec](params)
		if err != nil {
			return nil, err
		}

		if err := a.volumes.Create(ctx, spec); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"name": spec.Name}, nil
	})

	a.server.Register("volumes.delete", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Name string `json:"name"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.volumes.Delete(ctx, args.Name); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"name": args.Name}, nil
	})
}

func (a *Agent) registerNetworks() {
	a.server.Register("networks.list", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.networks.List(ctx)
	})

	a.server.Register("networks.create", func(ctx context.Context, params json.RawMessage) (any, error) {
		spec, err := decodeParams[networks.Spec](params)
		if err != nil {
			return nil, err
		}

		if err := a.networks.Create(ctx, spec); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"name": spec.Name}, nil
	})

	a.server.Register("networks.delete", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Name string `json:"name"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.networks.Delete(ctx, args.Name); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"name": args.Name}, nil
	})
}

// --- machines -------------------------------------------------------------

func (a *Agent) registerMachines() {
	a.server.Register("machines.list", func(ctx context.Context, _ json.RawMessage) (any, error) {
		return a.machines.List(ctx)
	})

	a.server.Register("machines.get", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		return a.machines.Get(ctx, args.ID)
	})

	a.server.Register("machines.start", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		machine, err := a.machines.Start(ctx, args.ID)
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return machine, nil
	})

	a.server.Register("machines.stop", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		machine, err := a.machines.Stop(ctx, args.ID)
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return machine, nil
	})

	a.server.Register("machines.delete", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.machines.Delete(ctx, args.ID); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"id": args.ID}, nil
	})

	a.server.Register("machines.setDefault", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		if err := a.machines.SetDefault(ctx, args.ID); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"id": args.ID}, nil
	})

	a.server.Register("machines.configure", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID       string            `json:"id"`
			Settings machines.Settings `json:"settings"`
		}](params)
		if err != nil {
			return nil, err
		}

		machine, err := a.machines.Configure(ctx, args.ID, args.Settings)
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return machine, nil
	})

	a.server.Register("machines.create", func(ctx context.Context, params json.RawMessage) (any, error) {
		spec, err := decodeParams[machines.Spec](params)
		if err != nil {
			return nil, err
		}

		id, err := a.streams.runCommand(ctx, "machine", func(ctx context.Context) (*exec.Cmd, error) {
			return a.machines.CreateCommand(ctx, spec)
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("machines.logs", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID     string `json:"id"`
			Tail   int    `json:"tail"`
			Follow *bool  `json:"follow"`
			Boot   bool   `json:"boot"`
		}](params)
		if err != nil {
			return nil, err
		}

		follow := args.Follow == nil || *args.Follow

		id, err := a.streams.runCommand(ctx, "logs", func(ctx context.Context) (*exec.Cmd, error) {
			return a.machines.LogsCommand(ctx, args.ID, args.Tail, follow, args.Boot), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})
}

// --- streams, events and terminals ----------------------------------------

func (a *Agent) registerStreams() {
	a.server.Register("system.logs", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Last   string `json:"last"`
			Follow *bool  `json:"follow"`
		}](params)
		if err != nil {
			return nil, err
		}

		if args.Last == "" {
			args.Last = "30m"
		}
		follow := args.Follow == nil || *args.Follow

		id, err := a.streams.runCommand(ctx, "syslog", func(ctx context.Context) (*exec.Cmd, error) {
			return a.system.LogsCommand(ctx, args.Last, follow), nil
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": id}, nil
	})

	a.server.Register("stream.cancel", func(_ context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID string `json:"id"`
		}](params)
		if err != nil {
			return nil, err
		}

		a.streams.cancel(args.ID)

		return map[string]any{}, nil
	})

	// One subscription per client; snapshots arrive as events.snapshot.
	a.server.Register("events.subscribe", func(ctx context.Context, _ json.RawMessage) (any, error) {
		id, updates, snapshot, ready := a.watcher.Subscribe()

		if ready {
			a.server.Notify("events.snapshot", snapshot)
		}

		go func() {
			defer a.watcher.Unsubscribe(id)

			for {
				select {
				case <-ctx.Done():
					return
				case next := <-updates:
					a.server.Notify("events.snapshot", next)
				}
			}
		}()

		return map[string]any{"subscribed": true}, nil
	})

	a.server.Register("terminal.open", func(ctx context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			Kind    string `json:"kind"`
			ID      string `json:"id"`
			Command string `json:"command"`
		}](params)
		if err != nil {
			return nil, err
		}

		kind := terminal.Container
		if args.Kind == string(terminal.Machine) {
			kind = terminal.Machine
		}

		streamID, err := a.streams.openTerminal(ctx, func(
			ctx context.Context,
			onData func([]byte),
			onClose func(error),
		) (*terminal.Session, error) {
			return terminal.Open(ctx, a.runner, a.logger, kind, args.ID, args.Command, onData, onClose)
		})
		if err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{"streamId": streamID}, nil
	})

	a.server.Register("terminal.input", func(_ context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID   string `json:"id"`
			Data string `json:"data"`
		}](params)
		if err != nil {
			return nil, err
		}

		session := a.streams.session(args.ID)
		if session == nil {
			return nil, rpc.Fail("terminal is closed")
		}

		decoded, err := decodeBase64(args.Data)
		if err != nil {
			return nil, err
		}

		if err := session.Write(decoded); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{}, nil
	})

	a.server.Register("terminal.resize", func(_ context.Context, params json.RawMessage) (any, error) {
		args, err := decodeParams[struct {
			ID   string `json:"id"`
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}](params)
		if err != nil {
			return nil, err
		}

		session := a.streams.session(args.ID)
		if session == nil {
			return map[string]any{}, nil
		}

		if err := session.Resize(args.Cols, args.Rows); err != nil {
			return nil, rpc.Fail(err.Error())
		}

		return map[string]any{}, nil
	})
}
