// pass.js - one agent pass: a `claude -p` on stream-json, fed entries on stdin, watched for silence.
//
// The pass runs in its own process group so a stall or a stop ends the agent and everything it started.
// Stream lines are parsed for the session id, the turn results and the usage (context); every line is
// copied (scrubbed) to the stream log. A pass silent for `stallMs` is killed.
import { spawn } from 'node:child_process';
import { scrub } from './log.js';

export const CLAUDE_ARGS = [
  '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash,Read,Edit,Write',
];

export function userLine(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
}

export class Pass {
  /**
   * @param {object} o
   * @param {{command: string, args: string[]}} o.agentCmd  the agent command (claude, or a stand-in)
   * @param {string} [o.resume]  a session id to resume
   * @param {string} o.cwd  the seat's work folder
   * @param {object} o.env  the agent's environment
   * @param {number} o.stallMs  silence that kills the pass
   * @param {(line: string) => void} [o.streamLog]  gets each stream line, scrubbed
   * @param {(ev: object) => void} [o.onEvent]  gets each parsed stream event
   */
  constructor({ agentCmd, resume, cwd, env, stallMs, streamLog, onEvent }) {
    this.args = [...agentCmd.args, ...CLAUDE_ARGS, ...(resume ? ['--resume', resume] : [])];
    this.command = agentCmd.command;
    this.cwd = cwd;
    this.env = env;
    this.stallMs = stallMs;
    this.streamLog = streamLog || (() => {});
    this.onEvent = onEvent || (() => {});
    this.sessionId = resume || '';
    this.usage = null;
    this.results = 0;
    this.stalled = false;
    this.ended = false;
    this.exited = false;
  }

  start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true,
    });
    this.pid = this.child.pid;
    this.done = new Promise((resolve) => {
      let settled = false;
      const finish = (r) => {
        if (settled) return;
        settled = true;
        this.exited = true;
        clearTimeout(this.timer);
        resolve({ ...r, stalled: this.stalled, sessionId: this.sessionId, usage: this.usage, results: this.results });
      };
      this.child.on('error', (e) => finish({ code: null, signal: null, error: e.code || e.message }));
      this.child.on('exit', (code, signal) => finish({ code, signal }));
    });
    this.child.stdin.on('error', () => {}); // the agent may exit before reading everything
    let buf = '';
    this.child.stdout.on('data', (chunk) => {
      this.alive();
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) this.line(line);
      }
    });
    this.child.stderr.on('data', (chunk) => {
      this.alive();
      this.streamLog(scrub(JSON.stringify({ type: 'stderr', text: String(chunk).slice(0, 2000) })) + '\n');
    });
    this.alive();
    return this;
  }

  line(line) {
    this.streamLog(scrub(line) + '\n');
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.session_id) this.sessionId = ev.session_id;
    if (ev.type === 'assistant' && ev.message?.usage) this.usage = ev.message.usage;
    if (ev.type === 'result') {
      this.results++;
      if (ev.usage) this.usage = ev.usage;
    }
    this.onEvent(ev);
  }

  /** Any output resets the stall clock. */
  alive() {
    clearTimeout(this.timer);
    if (this.exited) return;
    this.timer = setTimeout(() => {
      this.stalled = true;
      this.kill('SIGKILL');
    }, this.stallMs);
    this.timer.unref?.();
  }

  send(text) {
    if (this.ended || this.exited) return false;
    this.child.stdin.write(userLine(text));
    return true;
  }

  /** Nothing left: close stdin; the agent ends its turn and exits. */
  end() {
    if (this.ended) return;
    this.ended = true;
    try { this.child.stdin.end(); } catch { /* already gone */ }
  }

  kill(sig = 'SIGTERM') {
    if (this.exited) return;
    try { process.kill(-this.pid, sig); } catch { try { this.child.kill(sig); } catch { /* gone */ } }
  }

  /** Stop: TERM, then KILL after `graceMs`; resolves when the agent has exited. */
  async stop(graceMs = 5000) {
    this.end();
    this.kill('SIGTERM');
    const t = setTimeout(() => this.kill('SIGKILL'), graceMs);
    const r = await this.done;
    clearTimeout(t);
    return r;
  }
}
