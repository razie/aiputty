// stubagent.js - a stand-in agent for the host's tests (deliberately not named or shaped like the real one).
// Speaks the stream-json the host speaks: reads user lines on stdin, writes init/assistant/result events.
// For each `[<id>] chat ... in chat <chat>: <text>` line it answers through d2, as the agent would, with the
// token from D2_TOKEN_FILE. The text steers the stub (never the host):
//   stub:slow=<ms>  wait before answering     stub:hang  go silent forever     stub:crash  exit 3 at once
// It exits 0 when stdin ends and every answer is sent.
import fs from 'node:fs';

const args = process.argv.slice(2);
const ri = args.indexOf('--resume');
const resumed = ri >= 0 ? args[ri + 1] : '';
const session = resumed || `stub-${process.pid}`;

const vars = {};
for (const l of fs.readFileSync(process.env.D2_TOKEN_FILE, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) vars[m[1]] = m[2];
}
const url = process.env.D2_URL;
const agent = process.env.D2_AGENT;

process.stdout.on('error', () => {}); // the host may be gone (kill -9): keep going, still answer
const emit = (ev) => { try { process.stdout.write(JSON.stringify(ev) + '\n'); } catch { /* gone */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

emit({ type: 'system', subtype: 'init', session_id: session });

let chain = Promise.resolve();
let buf = '';
let turns = 0;

async function answer(id, chat, text) {
  await fetch(`${url}/api/v2/cmd/chat/${chat}/say`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vars.D2_TOKEN}`, 'D2-Agent': agent, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `stub ${process.pid}${resumed ? ' resumed' : ''} answers ${id}: ${text.slice(0, 40)}`, answers: [id] }),
  }).then((r) => { if (!r.ok) process.stderr.write(`stub: answer ${id} got HTTP ${r.status}\n`); });
}

async function turn(content) {
  const lines = content.split('\n');
  for (const l of lines) {
    const m = l.match(/^\[([^\]]+)\] chat from \S+ in chat (\S+): (.*)$/);
    if (!m) continue;
    const [, id, chat, text] = m;
    if (text.includes('stub:crash')) process.exit(3);
    if (text.includes('stub:hang')) { await new Promise(() => {}); }
    const slow = text.match(/stub:slow=(\d+)/);
    if (slow) await sleep(Number(slow[1]));
    await answer(id, chat, text);
  }
  turns++;
  emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 1000 * turns, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 10 } } });
  emit({ type: 'result', subtype: 'success', session_id: session, usage: { input_tokens: 1000 * turns, output_tokens: 10 } });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'user') chain = chain.then(() => turn(String(ev.message?.content || '')));
  }
});
process.stdin.on('end', () => { chain.then(() => process.exit(0)); });
