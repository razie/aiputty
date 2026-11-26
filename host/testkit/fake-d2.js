// fake-d2.js - a stand-in for d2 in the host's tests: /agents/next, chat say, status, alert, start prompt.
// Answers are counted per message id, so a test can check that each message was answered exactly once.
import http from 'node:http';

// built from parts so the repo never holds a token-shaped literal
export const TOKEN = ['d2t', 'fakehosttest', 'x9y8z7w6v5u4'].join('_');
export const AGENT = 'designer-77';

export async function fakeD2({ token = TOKEN, agent = AGENT } = {}) {
  const pending = new Map();   // id -> entry
  const answers = [];          // {id, text, at}
  const statuses = [];
  const alerts = [];
  const starts = [];
  const waiters = new Set();
  let nextCalls = 0;
  let revoked = false;
  let seq = 0;

  const wake = () => { for (const w of waiters) w(); waiters.clear(); };

  const send = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const auth = req.headers.authorization;
    if (revoked || auth !== `Bearer ${token}` || req.headers['d2-agent'] !== agent) {
      return send(res, 401, { ok: false, error: { code: 'E_AUTH', message: 'not a token d2 issued' } });
    }
    const url = new URL(req.url, 'http://x');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: 'bad json' } }); }

    if (req.method === 'GET' && url.pathname === '/api/v2/agents/next') {
      nextCalls++;
      const wait = Number(url.searchParams.get('wait') || 0);
      if (!pending.size && wait > 0) {
        await new Promise((r) => { const t = setTimeout(r, Math.min(wait * 1000, 200)); waiters.add(() => { clearTimeout(t); r(); }); });
      }
      const items = [...pending.values()];
      return send(res, 200, { ok: true, items, count: items.length });
    }
    let m;
    if (req.method === 'POST' && (m = url.pathname.match(/^\/api\/v2\/cmd\/chat\/([^/]+)\/say$/))) {
      for (const id of body.answers || []) {
        answers.push({ id, chat: m[1], text: body.text, at: Date.now() });
        pending.delete(id);
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/v2/agents/next/answer') {
      answers.push({ id: body.id, text: body.text, at: Date.now() });
      pending.delete(body.id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/v2/cmd/Agent/status') {
      statuses.push(body);
      return send(res, 200, { ok: true, status: body });
    }
    if (req.method === 'POST' && url.pathname === '/api/v2/agents/alert') {
      alerts.push(body);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/v2/skills/start') {
      starts.push(url.searchParams.get('kind'));
      return send(res, 200, {
        ok: true, role: url.searchParams.get('role'),
        text: 'You are the {role} on {project}, started by {startedBy}. Your agent name: {agent}. Token in {env}. d2 at {url}.',
      });
    }
    return send(res, 404, { ok: false, error: { code: 'E_NOT_FOUND', message: `${req.method} ${url.pathname}` } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url, token, agent, answers, statuses, alerts, starts,
    get nextCalls() { return nextCalls; },
    get pending() { return [...pending.keys()]; },
    /** A chat message from the person; returns its id. */
    say(text, chat = 'chat-1') {
      const id = `m${++seq}`;
      pending.set(id, { kind: 'chat', id, at: new Date().toISOString(), from: 'person', chat, text });
      wake();
      return id;
    },
    answersFor(id) { return answers.filter((a) => a.id === id).length; },
    revoke() { revoked = true; },
    close() { wake(); server.closeAllConnections?.(); return new Promise((r) => server.close(r)); },
  };
}
