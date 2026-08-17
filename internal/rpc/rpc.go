// Package rpc speaks JSON-RPC 2.0 over a pair of streams -- in practice the
// agent's stdin and stdout. There is no socket and no port: the process that
// spawned the agent is the only thing that can talk to it.
package rpc

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sync"
)

// Error codes follow the JSON-RPC spec, with one application code for the
// failures that are ordinary here (a CLI command refusing to run).
const (
	CodeParse          = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternal       = -32603
	CodeCommandFailed  = -32000
)

type Request struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Method  string           `json:"method"`
	Params  json.RawMessage  `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Result  any              `json:"result,omitempty"`
	Error   *Error           `json:"error,omitempty"`
}

type Notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string {
	return e.Message
}

// Fail builds an application-level error, the kind worth showing to a user.
func Fail(message string) *Error {
	return &Error{Code: CodeCommandFailed, Message: message}
}

// Handler answers one method. Returning an error turns into a JSON-RPC error.
type Handler func(ctx context.Context, params json.RawMessage) (any, error)

type Server struct {
	logger   *slog.Logger
	in       io.Reader
	out      io.Writer
	handlers map[string]Handler

	// One writer at a time: responses and notifications share the pipe.
	writeMu sync.Mutex
}

func NewServer(in io.Reader, out io.Writer, logger *slog.Logger) *Server {
	return &Server{
		logger:   logger,
		in:       in,
		out:      out,
		handlers: map[string]Handler{},
	}
}

func (s *Server) Register(method string, handler Handler) {
	s.handlers[method] = handler
}

// Notify pushes a message the client did not ask for: stream data, watcher
// snapshots, terminal output.
func (s *Server) Notify(method string, params any) {
	s.write(Notification{JSONRPC: "2.0", Method: method, Params: params})
}

func (s *Server) write(message any) {
	encoded, err := json.Marshal(message)
	if err != nil {
		s.logger.Error("Could not encode message", "error", err)
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	if _, err := fmt.Fprintf(s.out, "%s\n", encoded); err != nil {
		s.logger.Debug("Could not write message", "error", err)
	}
}

// Serve reads requests until the input closes, which happens when the app
// quits. Each request runs in its own goroutine so a slow CLI call cannot block
// the rest -- a container pull must not freeze the list.
func (s *Server) Serve(ctx context.Context) error {
	scanner := bufio.NewScanner(s.in)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		payload := make([]byte, len(line))
		copy(payload, line)

		go s.dispatch(ctx, payload)
	}

	return scanner.Err()
}

func (s *Server) dispatch(ctx context.Context, payload []byte) {
	var request Request
	if err := json.Unmarshal(payload, &request); err != nil {
		s.write(Response{
			JSONRPC: "2.0",
			Error:   &Error{Code: CodeParse, Message: "invalid JSON"},
		})
		return
	}

	handler, ok := s.handlers[request.Method]
	if !ok {
		s.respondError(request.ID, CodeMethodNotFound, "unknown method: "+request.Method)
		return
	}

	result, err := handler(ctx, request.Params)
	if err != nil {
		var rpcErr *Error
		if ok := asRPCError(err, &rpcErr); ok {
			s.respondError(request.ID, rpcErr.Code, rpcErr.Message)
			return
		}
		s.respondError(request.ID, CodeCommandFailed, err.Error())
		return
	}

	// Notifications (no id) expect no reply.
	if request.ID == nil {
		return
	}

	s.write(Response{JSONRPC: "2.0", ID: request.ID, Result: result})
}

func (s *Server) respondError(id *json.RawMessage, code int, message string) {
	if id == nil {
		s.logger.Debug("Dropping error for a notification", "message", message)
		return
	}

	s.write(Response{JSONRPC: "2.0", ID: id, Error: &Error{Code: code, Message: message}})
}

func asRPCError(err error, target **Error) bool {
	if rpcErr, ok := err.(*Error); ok {
		*target = rpcErr
		return true
	}
	return false
}
