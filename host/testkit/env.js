// env.js - a throwaway host home for one test: a token file (600), a config, and helpers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Seat } from '../lib/seat.js';

export const STUB = fileURLToPath(new URL('./stubagent.js', import.meta.url));
export const LOOP = fileURLToPath(new URL('../loop.js', import.meta.url));

export function tempHome(fake) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aiputty-host-test-'));
  fs.chmodSync(home, 0o700);
  const tokenFile = path.join(home, 'tokens', `${fake.agent}.env`);
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tokenFile, `D2_AGENT=${fake.agent}\nD2_TOKEN=${fake.token}\n`, { mode: 0o600 });
  const config = path.join(home, 'host.json');
  fs.writeFileSync(config, JSON.stringify({
    url: fake.url, project: 'hosttest', startedBy: 'tester', home,
    claude: [process.execPath, STUB],
    seats: [{ role: 'designer', tokenFile, work: path.join(home, 'work') }],
  }, null, 2));
  return { home, tokenFile, config, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}

export function makeSeat(fake, h, timing = {}) {
  return new Seat({
    url: fake.url, project: 'hosttest', role: 'designer', agent: fake.agent, token: fake.token,
    tokenFile: h.tokenFile, work: path.join(h.home, 'work'), home: h.home, startedBy: 'tester',
    agentCmd: { command: process.execPath, args: [STUB] },
    timing: { heartbeatMs: 100, nextWait: 1, idlePollMs: 20, errorMs: 50, repeatMs: 200, ...timing },
  });
}

export async function until(fn, ms = 8000, what = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Every file under `dir`, read as text. */
export function allText(dir) {
  let out = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out += fs.readFileSync(path.join(e.parentPath ?? e.path, e.name), 'utf8');
  }
  return out;
}
