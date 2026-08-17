'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');

/**
 * JSON-RPC 2.0 client for the Go agent, speaking newline-delimited JSON over
 * the child's stdin/stdout. No ports, no sockets: if this process dies, the
 * agent goes with it.
 */
class Agent {
  constructor({ binary, env, onNotify, onExit, logger = console }) {
    this.binary = binary;
    this.env = env;
    this.onNotify = onNotify;
    this.onExit = onExit;
    this.logger = logger;

    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    this.child = spawn(this.binary, [], {
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    readline.createInterface({ input: this.child.stdout }).on('line', (line) => {
      if (!line.trim()) return;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.logger.warn('[agent] unreadable message', line.slice(0, 200));
        return;
      }

      // A message without an id is something the agent decided to tell us.
      if (message.id === undefined || message.id === null) {
        this.onNotify?.(message);
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });

    // The agent logs to stderr; keep it in the app's own output.
    readline.createInterface({ input: this.child.stderr }).on('line', (line) => {
      this.logger.log('[agent]', line);
    });

    this.child.on('exit', (code) => {
      this.child = null;

      // Nothing will answer the calls that were in flight.
      for (const { reject } of this.pending.values()) {
        reject(new Error('The Dermaga agent stopped'));
      }
      this.pending.clear();

      this.onExit?.(code);
    });
  }

  invoke(method, params) {
    if (!this.child) return Promise.reject(new Error('The Dermaga agent is not running'));

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  stop() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill('SIGTERM');
    this.child = null;
  }
}

module.exports = { Agent };
