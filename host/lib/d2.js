// d2.js - the calls the host makes to d2, as one agent. The token only ever goes in a request header.
import { scrub } from './log.js';

export class D2Error extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  /** The token was refused: revoked or expired. */
  get auth() { return this.status === 401 || this.status === 403; }
}

export class D2 {
  constructor({ url, agent, token, timeoutMs = 30_000 }) {
    this.url = url.replace(/\/+$/, '');
    this.agent = agent;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async call(method, path, body, { signal, timeoutMs } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs || this.timeoutMs);
    const onAbort = () => ctl.abort(signal.reason);
    if (signal) {
      if (signal.aborted) ctl.abort(signal.reason);
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const headers = { Authorization: `Bearer ${this.token}`, 'D2-Agent': this.agent };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let res;
      try {
        res = await fetch(this.url + path, {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal,
        });
      } catch (e) {
        if (signal && signal.aborted) throw e;
        throw new D2Error(0, 'E_NETWORK', `d2 unreachable: ${scrub(e.cause?.code || e.message)}`);
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      if (res.status === 204) return { ok: true, items: [] };
      if (!res.ok || (json && json.ok === false)) {
        const err = json && json.error;
        throw new D2Error(res.status, err?.code || `HTTP_${res.status}`, scrub(err?.message || text.slice(0, 200)));
      }
      return json ?? {};
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  /** What waits for this agent (d2 orders it); long-polls up to `wait` seconds. */
  next({ wait = 10, signal } = {}) {
    return this.call('GET', `/api/v2/agents/next?wait=${wait}`, undefined, { signal, timeoutMs: (wait + 20) * 1000 });
  }

  status(body) { return this.call('POST', '/api/v2/cmd/Agent/status', body); }

  alert(body) { return this.call('POST', '/api/v2/agents/alert', body); }

  /** d2's own start prompt for a role (P-3903): the host has no built-in text. */
  start(role, kind) {
    return this.call('GET', `/api/v2/skills/start?role=${encodeURIComponent(role)}&kind=${encodeURIComponent(kind)}`);
  }
}
