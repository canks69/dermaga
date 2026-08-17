# Contributing

## Getting set up

```bash
make desktop-deps   # npm install for the renderer
make dev            # builds the agent, then runs Vite + Electron
```

You need Go 1.23+, Node 18+, and Apple's [`container`](https://github.com/apple/container)
CLI on your PATH. Everything the app does goes through that CLI, so if a command
misbehaves in Dermaga, try it in a terminal first.

## Before opening a pull request

```bash
make check    # go vet, go test, tsc, eslint
make fmt      # gofmt + prettier
```

## Layout

See the architecture section in the [README](README.md#architecture). In short:

- `cmd/dermaga-agent` — the Go process; speaks JSON-RPC on stdio
- `internal/…` — one package per domain, none of which import each other's
  transports
- `desktop/electron` — the Electron shell, which spawns the agent
- `desktop/src` — the React renderer, which has no network access of its own

## Conventions

- A domain package never imports the watcher or the RPC layer. If it needs to
  announce a change, it takes a `notify.Notifier`.
- `internal/cli` is the only package allowed to use `os/exec`.
- Adding an operation means: a method on the domain manager, then a case in
  `internal/agent`, then a call in `desktop/src/services/api.ts`.
- Anything long-running is a stream, so the UI can show progress and cancel it.

## Commits

Write commit subjects that read as the change itself, prefixed by kind:

```
feat: multi-select for bulk container actions
fix: sidebar logo off-centre when collapsed
perf: skip the watcher tick when nothing is subscribed
docs: explain the bootstrap sequence
chore: bump electron to 43
```

The prefixes group the release notes, so the subject is what users read.
[scripts/release-notes.sh](scripts/release-notes.sh) sorts the commits between two tags into
Features, Bug fixes, Performance, Documentation and Maintenance. Preview what a release would say
with `make notes VERSION=1.1.0`.

## Releasing

```bash
make release VERSION=1.1.0
```

That one command runs `make check`, bumps `desktop/package.json`, commits, tags `v1.1.0`, pushes,
builds the DMG with the version and commit stamped into it, and publishes a GitHub release with the
notes built from those commit prefixes and the DMG attached.

It refuses to start on a dirty working tree, on a failing check, or when the tag already exists, so
a tag always points at something that actually built. The version the app reports comes from
`git describe`, so a build can always be traced back to its commit.
