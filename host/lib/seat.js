// seat.js - one seat's loop (DesignMacHost section 2), shaped like ops-launcher.sh: no model while idle.
//
//   1. Read this agent's /agents/next with its own token; d2 orders chats, mail, status due and items.
//   2. Something waits: start (or resume) one agent pass and write the entries to its stdin; entries that
//      arrive mid-pass go in too.
//   3. Nothing left: close stdin; the pass ends. Heartbeat every 60 s throughout.
//
// The host keeps no cursors: an unanswered entry comes again from d2. No text decides anything: the words
// in a chat ("bye", "handover", "stop") are only handed to the agent; only d2's state ends or starts work.
// A pass silent for 10 minutes is killed; three failed passes in a row back off 10 minutes and say so once
// in the chat. A pass the host lost (the host was killed) is waited for before the next one starts, so an
// entry it was answering is never answered twice.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { D2 } from './d2.js';
import { Pass } from './pass.js';
import { addSecret, isTokenish, makeLog } from './log.js';

export const TIMING = Object.freeze({
  heartbeatMs: 60_000,      // status every 60 s
  every: 60,                // the cadence the status declares
  nextWait: 10,             // long-poll seconds on /agents/next
  stallMs: 10 * 60_000,     // a silent stream this long kills the pass
  failLimit: 3,             // failed passes in a row before backing off
  backoffMs: 10 * 60_000,   // the back-off
  errorMs: 15_000,          // d2 unreachable: wait before asking again
  repeatMs: 60_000,         // a clean pass left the same entries: wait before handing them again
  idlePollMs: 1_000,        // d2 answered "nothing" at once: wait before asking again
  window: 200_000,          // the model's context window, for `context`
  freshAt: 70,              // context % at which the next pass starts a fresh session
});

const STRIP_ENV = ['D2_TOKEN', 'D2_AGENT_TOKEN', 'D2_BUILDER', 'D2_TOKEN_FILE', 'D2_AGENT', 'D2_URL', 'D2_PROJECT'];

export function entryKey(e) { return `${e.kind}:${e.id}`; }

/** One line per entry, the way the agent reads it: `[<id>] <kind> from <who> in chat <chat>: <text>`. */
export function formatEntry(e) {
  const text = typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim() : '';
  let s = `[${e.id}] ${e.kind || 'entry'}`;
  if (e.from) s += ` from ${e.from}`;
  if (e.chat) s += ` in chat ${typeof e.chat === 'object' ? e.chat.id || JSON.stringify(e.chat) : e.chat}`;
  if (e.urgent) s += ' (urgent)';
  if (text) s += `: ${text}`;
  return s;
}

export function entriesOf(next) {
  const items = (next && Array.isArray(next.items)) ? next.items : [];
  return items.filter((e) => e && typeof e === 'object' && e.id !== undefined && e.id !== null && e.id !== '');
}

function fill(text, vals) {
  return text.replace(/\{([A-Za-z]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vals, k) ? vals[k] : m));
}

function alivePid(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function commandOf(pid) {
  try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

export class Seat {
  /**
   * @param {object} o
   * @param {string} o.url  d2's base URL
   * @param {string} o.project
   * @param {string} o.role
   * @param {string} o.agent  the seat's agent name
   * @param {string} o.token  its agent token (kept in memory, sent only as a header)
   * @param {string} o.tokenFile  the token file, handed to the agent by path
   * @param {string} o.work  the agent's work folder
   * @param {string} o.home  the host's folder (logs, state)
   * @param {string} o.startedBy
   * @param {{command: string, args: string[]}} o.agentCmd
   * @param {object} [o.timing]  TIMING overrides (the tests' clock; the CLI never sets them)
   */
  constructor(o) {
    Object.assign(this, {
      url: o.url, project: o.project, role: o.role, agent: o.agent, tokenFile: o.tokenFile,
      work: o.work, home: o.home, startedBy: o.startedBy, agentCmd: o.agentCmd,
    });
    addSecret(o.token);
    this.t = { ...TIMING, ...(o.timing || {}) };
    this.d2 = new D2({ url: o.url, agent: o.agent, token: o.token });
    this.stateDir = path.join(this.home, 'host', 'state');
    this.logDir = path.join(this.home, 'host', 'logs');
    this.log = makeLog(path.join(this.logDir, `${this.agent}.log`), { echo: !!o.echo });
    this.streamFile = path.join(this.logDir, `${this.agent}.stream.jsonl`);
    this.pidFile = path.join(this.stateDir, `${this.agent}.pass.json`);
    this.stateFile = path.join(this.stateDir, `${this.agent}.json`);
    this.stopping = false;
    this.stopCtl = new AbortController();
    this.pass = null;
    this.fails = 0;
    this.context = 0;
    this.contextTokens = 0;
    this.note = 'waiting for work, no model while idle';
    this.ended = '';
    this.passes = 0;
  }

  // ---- small helpers ----

  sleep(ms) {
    return new Promise((resolve) => {
      if (this.stopping) return resolve();
      const t = setTimeout(done, ms);
      const sig = this.stopCtl.signal;
      function done() { clearTimeout(t); sig.removeEventListener('abort', done); resolve(); }
      sig.addEventListener('abort', done, { once: true });
    });
  }

  readState() {
    try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch { return {}; }
  }

  writeState(s) {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const tmp = `${this.stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, this.stateFile);
  }

  agentEnv() {
    const env = { ...process.env };
    // the named token vars, and any other var holding a token (a role token in the host's own env)
    for (const k of Object.keys(env)) if (STRIP_ENV.includes(k) || isTokenish(env[k])) delete env[k];
    env.D2_AGENT = this.agent;
    env.D2_TOKEN_FILE = this.tokenFile;
    env.D2_URL = this.url;
    return env;
  }

  // ---- status ----

  async status(state, text) {
    const body = {
      agent: this.agent, role: this.role, state, startedBy: this.startedBy, every: this.t.every,
      context: this.context, contextTokens: this.contextTokens, window: this.t.window,
      text: String(text || this.note).slice(0, 300), caps: { workers: 0, harness: 'd2-host' },
    };
    try {
      await this.d2.status(body);
    } catch (e) {
      if (e.auth) return this.revoked(`status ${e.status} ${e.code}`);
      if (e.code === 'E_PHASE' && state !== 'up') {
        try { await this.d2.status({ ...body, state: 'up' }); return; } catch (e2) { e = e2; }
      }
      this.log(`status ${state} failed: ${e.status || ''} ${e.code} ${e.message}`);
    }
  }

  heartbeat() {
    if (this.stopping) return;
    this.status(this.pass ? 'working' : 'idle');
  }

  revoked(why) {
    if (this.ended) return;
    this.log(`token refused (${why}): stopping this seat; mint a new token to start it again`);
    this.ended = 'revoked';
    this.stop();
  }

  // ---- a pass the host lost ----

  /** A pass left running by a host that was killed: wait for it to end (at most stallMs), then kill it. */
  async waitLost() {
    let lost;
    try { lost = JSON.parse(fs.readFileSync(this.pidFile, 'utf8')); } catch { return; }
    const ours = () => {
      if (!lost.pid || !alivePid(lost.pid)) return false;
      const cmd = commandOf(lost.pid);
      return !!cmd && (!lost.mark || cmd.includes(lost.mark));
    };
    if (ours()) {
      this.log(`a pass from a killed host is still running (pid ${lost.pid}): waiting for it to end`);
      const until = Date.now() + this.t.stallMs;
      while (ours() && Date.now() < until && !this.stopping) await this.sleep(250);
      if (ours()) {
        this.log(`lost pass ${lost.pid} still running after ${this.t.stallMs} ms: killing it`);
        try { process.kill(-lost.pid, 'SIGKILL'); } catch { try { process.kill(lost.pid, 'SIGKILL'); } catch { /* gone */ } }
      }
    }
    try { fs.unlinkSync(this.pidFile); } catch { /* gone */ }
  }

  // ---- the loop ----

  async run() {
    fs.mkdirSync(this.work, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    this.log(`seat ${this.role} as ${this.agent} on ${this.url} (host pid ${process.pid})`);
    await this.waitLost();
    if (this.stopping) return this.ended || 'stopped';
    await this.status('up', 'host up: waiting for work, no model while idle');
    this.hb = setInterval(() => this.heartbeat(), this.t.heartbeatMs);
    let last = { keys: new Set(), at: 0 };
    try {
      while (!this.stopping) {
        let next;
        const asked = Date.now();
        try {
          next = await this.d2.next({ wait: this.t.nextWait, signal: this.stopCtl.signal });
        } catch (e) {
          if (this.stopping) break;
          if (e.auth) { this.revoked(`next ${e.status} ${e.code}`); break; }
          this.log(`next failed: ${e.status || ''} ${e.code} ${e.message}; no passes while d2 is down`);
          await this.sleep(this.t.errorMs);
          continue;
        }
        const entries = entriesOf(next);
        if (!entries.length) {
          if (Date.now() - asked < this.t.idlePollMs) await this.sleep(this.t.idlePollMs);
          continue;
        }
        if (entries.every((e) => last.keys.has(entryKey(e))) && Date.now() - last.at < this.t.repeatMs) {
          await this.sleep(Math.min(this.t.repeatMs - (Date.now() - last.at), this.t.repeatMs));
          continue;
        }
        const r = await this.runPass(entries);
        if (this.stopping) break;
        last = { keys: r.handed, at: Date.now() };
        if (r.failed) {
          this.fails++;
          this.log(`pass failed (${this.fails} in a row): ${r.why}`);
          if (this.fails >= this.t.failLimit) await this.backOff(r, entries);
        } else {
          this.fails = 0;
        }
      }
    } finally {
      clearInterval(this.hb);
    }
    if (this.pass) await this.pass.stop();
    this.log(`seat ${this.agent} ended: ${this.ended || 'stopped'}`);
    return this.ended || 'stopped';
  }

  async backOff(r, entries) {
    const mins = Math.round(this.t.backoffMs / 60_000);
    const text = `${this.agent}: ${this.fails} passes failed in a row (last: ${r.why}); the host waits ${mins} min before the next`;
    this.log(text);
    const chatEntry = entries.find((e) => e.chat);
    const chat = chatEntry ? (typeof chatEntry.chat === 'object' ? chatEntry.chat.id : chatEntry.chat) : undefined;
    try {
      await this.d2.alert({ kind: 'crash', text: text.slice(0, 500), agent: this.agent, ...(chat ? { chat: String(chat) } : {}) });
    } catch (e) {
      if (e.auth) return this.revoked(`alert ${e.status}`);
      this.log(`alert failed: ${e.code} ${e.message}`);
    }
    this.note = `backing off ${mins} min after ${this.fails} failed passes`;
    await this.status('waiting', this.note);
    this.fails = 0;
    await this.sleep(this.t.backoffMs);
    this.note = 'waiting for work, no model while idle';
  }

  async startPrompt() {
    const r = await this.d2.start(this.role, 'pass,minted');
    if (!r || typeof r.text !== 'string' || !r.text.trim()) throw new Error('d2 sent no start prompt');
    return fill(r.text, {
      agent: this.agent, role: this.role, project: this.project, url: this.url, startedBy: this.startedBy,
      env: this.tokenFile, mint: '(already done: the host minted your agent token)',
      item: 'none yet: the host hands you what your /agents/next lists, below',
    });
  }

  /** One pass for these entries; resolves {failed, why, handed}. */
  async runPass(entries) {
    const handed = new Set();
    const state = this.readState();
    let first = entries.map(formatEntry).join('\n');
    if (!state.sessionId) {
      let prompt;
      try { prompt = await this.startPrompt(); } catch (e) {
        if (e.auth) { this.revoked(`start ${e.status}`); return { failed: false, handed }; }
        return { failed: true, why: `no start prompt: ${e.code || ''} ${e.message}`, handed };
      }
      first = `${prompt}\n\n${first}`;
    }
    const pass = new Pass({
      agentCmd: this.agentCmd, resume: state.sessionId, cwd: this.work, env: this.agentEnv(),
      stallMs: this.t.stallMs, streamLog: (line) => this.log.raw(this.streamFile, line),
      onEvent: (ev) => { if (ev.type === 'result' && this.poll) this.poll.abort(); },
    });
    this.pass = pass;
    this.passes++;
    pass.start();
    const mark = (this.agentCmd.args[0] && path.basename(this.agentCmd.args[0])) || path.basename(this.agentCmd.command);
    try {
      fs.writeFileSync(this.pidFile, JSON.stringify({ pid: pass.pid, mark, at: new Date().toISOString() }), { mode: 0o600 });
    } catch (e) { this.log(`cannot write ${this.pidFile}: ${e.message}`); }
    this.log(`pass ${this.passes} started (pid ${pass.pid}${state.sessionId ? ', resumed' : ', fresh'}): ${entries.map(entryKey).join(' ')}`);
    this.note = `pass running: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} handed`;
    this.status('working');
    for (const e of entries) handed.add(entryKey(e));
    pass.send(first);
    let sendMark = 0;

    while (!pass.exited && !this.stopping && !pass.ended) {
      const idle = pass.results > sendMark;
      this.poll = new AbortController();
      const onStop = () => this.poll.abort();
      this.stopCtl.signal.addEventListener('abort', onStop, { once: true });
      let next;
      try {
        next = await Promise.race([
          pass.done.then(() => null),
          this.d2.next({ wait: idle ? 0 : this.t.nextWait, signal: this.poll.signal }),
        ]);
      } catch (e) {
        if (this.poll.signal.aborted) continue;
        if (e.auth) { this.revoked(`next ${e.status} ${e.code}`); break; }
        this.log(`next failed mid-pass: ${e.code} ${e.message}`);
        await Promise.race([pass.done, this.sleep(Math.min(this.t.errorMs, 5000))]);
        continue;
      } finally {
        this.stopCtl.signal.removeEventListener('abort', onStop);
        this.poll.abort();
        this.poll = null;
      }
      if (next === null) break;
      const now = entriesOf(next);
      const fresh = now.filter((e) => !handed.has(entryKey(e)));
      if (fresh.length) {
        for (const e of fresh) handed.add(entryKey(e));
        sendMark = pass.results;
        pass.send(fresh.map(formatEntry).join('\n'));
        this.log(`handed mid-pass: ${fresh.map(entryKey).join(' ')}`);
      } else if (!now.length || idle) {
        pass.end();
      }
    }
    if (this.stopping) await pass.stop();
    const r = await pass.done;
    this.pass = null;
    try { fs.unlinkSync(this.pidFile); } catch { /* gone */ }

    const u = r.usage;
    if (u) {
      this.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      this.context = Math.min(100, Math.round((100 * this.contextTokens) / this.t.window));
    }
    let why = '';
    if (r.stalled) why = `no output for ${Math.round(this.t.stallMs / 1000)} s: killed`;
    else if (r.error) why = `could not start ${this.agentCmd.command}: ${r.error}`;
    else if (r.signal && !this.stopping) why = `ended by ${r.signal}`;
    else if (r.code && !this.stopping) why = `exit ${r.code}`;
    const failed = !!why;
    // a failed pass, or one near the context limit, starts the next one fresh
    const keep = !failed && r.sessionId && this.context < this.t.freshAt;
    this.writeState(keep ? { sessionId: r.sessionId } : {});
    this.note = 'waiting for work, no model while idle';
    this.log(`pass ${this.passes} ended: ${failed ? why : 'ok'} (${r.results} turn${r.results === 1 ? '' : 's'}, context ${this.context}%)`);
    if (!this.stopping) this.status('idle');
    return { failed, why, handed };
  }

  /** Stop the seat: ends a running pass (TERM, then KILL) and the loop. */
  stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.stopCtl.abort();
    clearInterval(this.hb);
    if (this.pass) this.pass.stop();
  }
}
