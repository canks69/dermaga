// Command dermaga-agent is the process behind the Dermaga desktop app. It
// speaks JSON-RPC 2.0 on stdin/stdout and wraps Apple's `container` CLI.
//
// It opens no ports and listens on no sockets: the only thing that can talk to
// it is the process that spawned it.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/ryanbekhen/dermaga/internal/agent"
	"github.com/ryanbekhen/dermaga/internal/rpc"
)

// Stamped at build time by the Makefile:
//
//	-ldflags "-X main.Version=1.2.3 -X main.Commit=abc1234 -X main.BuildDate=..."
//
// A release build reports the tag it was cut from and the commit it contains,
// which is what the status bar shows.
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = ""
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("%s (%s)\n", Version, Commit)
		return
	}

	// Logs go to stderr because stdout carries the protocol.
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	logger.Info("Starting Dermaga agent", "version", Version, "commit", Commit)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := rpc.NewServer(os.Stdin, os.Stdout, logger)

	dermaga := agent.New(server, logger)
	dermaga.SetBuild(agent.Build{Version: Version, Commit: Commit, Date: BuildDate})

	if err := dermaga.Run(ctx); err != nil {
		logger.Error("Agent stopped", "error", err)
		os.Exit(1)
	}

	logger.Info("Agent stopped")
}
