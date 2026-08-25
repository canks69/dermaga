package window

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"
	"time"
)

// JSON-RPC 2.0 client for the Go agent, over a Unix socket in ~/.dermaga.
//
// The agent is not this process's child by necessity. One may already be
// running -- installed as a background service, so that containers are still
// watched and restarted while no window is open -- and this connects to it.
// When there is none, one is started here and taken down again on quit.
//
// No ports either way: the socket sits in the user's own directory, readable
// by nobody else.

// ErrNotRunning is what every call gets when there is no agent to send it to.
var ErrNotRunning = errors.New("the Dermaga agent is not running")

// Notification is anything the agent decided to tell us: a snapshot, a stream
// chunk, terminal output. It carries no id, which is how it is told apart from
// an answer to something we asked.
type Notification struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type rpcResponse struct {
	ID     *uint64         `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

type rpcError struct {
	Message string `json:"message"`
}

type pending struct {
	result chan json.RawMessage
	fail   chan error
}

// Agent is the connection to the agent, whoever started it.
type Agent struct {
	binary string
	socket string
	env    []string

	onNotify func(Notification)
	onExit   func(code *int)

	mu       sync.Mutex
	conn     net.Conn
	child    *exec.Cmd
	waiting  map[uint64]pending
	nextID   uint64
	stopping bool
}

// NewAgent prepares a client; nothing happens until Start.
func NewAgent(binary, socket string, env []string, onNotify func(Notification), onExit func(*int)) *Agent {
	return &Agent{
		binary:   binary,
		socket:   socket,
		env:      env,
		onNotify: onNotify,
		onExit:   onExit,
		waiting:  make(map[uint64]pending),
		nextID:   1,
	}
}

// Start resolves once there is an agent answering, whoever started it.
func (a *Agent) Start() error {
	a.mu.Lock()
	a.stopping = false
	a.mu.Unlock()

	if a.connect() {
		log.Println("[agent] using the agent already running")
		return nil
	}

	if err := a.spawn(); err != nil {
		return err
	}

	if !a.waitForAgent() {
		return errors.New("the Dermaga agent did not come up")
	}

	return nil
}

func (a *Agent) spawn() error {
	cmd := exec.Command(a.binary)
	cmd.Env = a.env

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			log.Println("[agent]", scanner.Text())
		}
	}()

	go func() {
		err := cmd.Wait()

		a.mu.Lock()
		a.child = nil
		stopping := a.stopping
		a.mu.Unlock()

		if stopping {
			return
		}

		code := cmd.ProcessState.ExitCode()
		_ = err
		if a.onExit != nil {
			a.onExit(&code)
		}
	}()

	a.mu.Lock()
	a.child = cmd
	a.mu.Unlock()

	return nil
}

// waitForAgent waits until the agent answers, which is not the same as waiting
// for its socket to appear.
//
// The file is not the thing. One is nearly always there already, left behind by
// a run that ended badly, and the agent removes it and binds its own on the way
// up. Waiting for the file therefore waited for nothing at all -- the stale one
// was there before the agent was even asked to start -- and the single
// connection attempt that used to follow arrived before anything was listening.
// That is how a perfectly good agent came to be reported as one that did not
// start, on every launch after an unclean exit.
//
// Waiting for an answer instead cannot be fooled by a leftover: nothing answers
// on a socket nobody is holding.
func (a *Agent) waitForAgent() bool {
	// Ten seconds, which is far longer than starting an agent takes and short
	// enough that a real failure is still reported rather than hung on. Dialing
	// a socket nobody holds fails at once, so this is a hundred quick tries
	// rather than a hundred timeouts.
	for i := 0; i < 100; i++ {
		if a.connect() {
			return true
		}

		// Nothing to wait for if the process is already gone.
		a.mu.Lock()
		gone := a.child == nil
		a.mu.Unlock()

		if gone {
			return false
		}

		time.Sleep(100 * time.Millisecond)
	}

	return false
}

func (a *Agent) connect() bool {
	conn, err := net.DialTimeout("unix", a.socket, 2*time.Second)
	if err != nil {
		return false
	}

	a.mu.Lock()
	a.conn = conn
	a.mu.Unlock()

	go a.read(conn)

	return true
}

// The largest single message the window will read.
//
// Snapshots carry every container, image and volume on the machine, so the
// default 64 KB is not enough for a busy Mac. This is not a number anything is
// expected to approach: the one message that ever did was every stored scan
// result with all of its findings, and that is now answered as counts. A limit
// is kept because the number has to come from somewhere, and an answer this
// far past what the agent has to say is a runaway rather than a busy Mac.
const maxMessage = 64 * 1024 * 1024

func (a *Agent) read(conn net.Conn) {
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 64*1024), maxMessage)

	for scanner.Scan() {
		a.receive(scanner.Bytes())
	}

	// A message too long to read ends this loop in exactly the way a closed
	// connection does, and went unreported: the window said the agent had
	// stopped, while the agent was still running and still listening, and every
	// call made afterwards failed saying the same thing. The two are mended in
	// completely different places, so which one happened is worth saying.
	if err := scanner.Err(); err != nil {
		log.Println("[dermaga] could not read from the agent:", err)
	}

	a.dropped()
}

func (a *Agent) receive(line []byte) {
	if len(line) == 0 {
		return
	}

	var message rpcResponse
	if err := json.Unmarshal(line, &message); err != nil {
		limit := min(len(line), 200)
		log.Println("[agent] unreadable message", string(line[:limit]))
		return
	}

	// A message without an id is something the agent decided to tell us.
	if message.ID == nil {
		if a.onNotify != nil {
			a.onNotify(Notification{Method: message.Method, Params: message.Params})
		}
		return
	}

	a.mu.Lock()
	waiter, ok := a.waiting[*message.ID]
	if ok {
		delete(a.waiting, *message.ID)
	}
	a.mu.Unlock()

	if !ok {
		return
	}

	if message.Error != nil {
		waiter.fail <- errors.New(message.Error.Message)
		return
	}

	waiter.result <- message.Result
}

// The connection went away: the service was restarted, or the agent we started
// died. Calls in flight will never be answered, and reconnecting is worth
// trying -- a service that restarts should not cost the user a window.
func (a *Agent) dropped() {
	a.mu.Lock()
	a.conn = nil
	waiting := a.waiting
	a.waiting = make(map[uint64]pending)
	stopping := a.stopping
	a.mu.Unlock()

	for _, waiter := range waiting {
		waiter.fail <- errors.New("the Dermaga agent stopped")
	}

	if stopping {
		return
	}

	if a.onExit != nil {
		a.onExit(nil)
	}

	time.AfterFunc(time.Second, func() {
		a.mu.Lock()
		retry := !a.stopping && a.conn == nil
		a.mu.Unlock()

		if retry {
			a.connect()
		}
	})
}

// Invoke calls a method on the agent and waits for its answer.
func (a *Agent) Invoke(method string, params any) (json.RawMessage, error) {
	a.mu.Lock()

	if a.conn == nil {
		a.mu.Unlock()
		return nil, ErrNotRunning
	}

	id := a.nextID
	a.nextID++

	waiter := pending{result: make(chan json.RawMessage, 1), fail: make(chan error, 1)}
	a.waiting[id] = waiter
	conn := a.conn

	a.mu.Unlock()

	request, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return nil, err
	}

	if _, err := conn.Write(append(request, '\n')); err != nil {
		a.mu.Lock()
		delete(a.waiting, id)
		a.mu.Unlock()

		return nil, fmt.Errorf("could not reach the agent: %w", err)
	}

	select {
	case result := <-waiter.result:
		return result, nil
	case err := <-waiter.fail:
		return nil, err
	}
}

// InvokeInto calls a method and unmarshals its result into target.
func (a *Agent) InvokeInto(method string, params any, target any) error {
	result, err := a.Invoke(method, params)
	if err != nil {
		return err
	}

	if len(result) == 0 || target == nil {
		return nil
	}

	return json.Unmarshal(result, target)
}

// Stop lets go of the agent. One this process started goes with it; one that
// was already running is left alone, because keeping containers up while
// Dermaga is closed is the whole reason it is there.
func (a *Agent) Stop() {
	a.mu.Lock()
	a.stopping = true

	conn := a.conn
	a.conn = nil

	child := a.child
	a.child = nil
	a.mu.Unlock()

	if conn != nil {
		_ = conn.Close()
	}

	if child != nil && child.Process != nil {
		_ = child.Process.Signal(os.Interrupt)
	}
}
