// Package notify carries a single idea: "something changed". Domain packages
// depend on this instead of on the watcher, so the watcher can depend on them.
package notify

type Notifier interface {
	Changed()
}

// Func adapts a plain function to a Notifier.
type Func func()

func (f Func) Changed() {
	if f != nil {
		f()
	}
}

// Nop is a Notifier that does nothing, for tests and for managers used
// standalone.
var Nop Notifier = Func(func() {})
