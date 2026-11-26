// node host/loop.js as a process: kill -9 mid-pass answers once, no token in ps, a readable token file refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fakeD2 } from '../testkit/fake-d2.js';
import { tempHome, until, pause, alive, allText, LOOP } from '../testkit/env.js';

const PREFIX = ['d2t', ''].join('_');

function host(config) {
  const child = spawn(process.execPath, [LOOP, '--config', config], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (c) => { err += c; });
  child.exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal, err })));
  return child;
}

function psAll() {
  // every process's command line and, for ours, its environment
  return execFileSync('ps', ['-axEww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

test('kill -9 mid-pass: the message is answered once, and the host carries on after a restart', async () => {
  const fake = await fakeD2();
  const h = tempHome(fake);
  const pidFile = path.join(h.home, 'host', 'state', `${fake.agent}.pass.json`);
  const agents = new Set();
  let h1, h2;
  try {
    h1 = host(h.config);
    await until(() => fake.statuses.some((s) => s.state === 'up'), 8000, 'host up');
    const id = fake.say('stub:slow=1500 answer me once');
    await until(() => fs.existsSync(pidFile), 5000, 'the pass started');
    const agentPid = JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid;
    agents.add(agentPid);
    await pause(300);

    const ps = psAll();
    assert.ok(!ps.includes(fake.token), 'no token in ps (command lines and environments)');
    assert.ok(!ps.includes(PREFIX + 'fakehost'), 'nothing token-shaped in ps');
    assert.ok(ps.includes('stubagent.js'), 'the stand-in agent shows in ps');

    process.kill(h1.pid, 'SIGKILL');
    await h1.exited;
    assert.equal(fake.answersFor(id), 0, 'killed before the answer');

    h2 = host(h.config);
    await until(() => fake.answersFor(id) >= 1, 8000, 'the answer');
    await until(() => !alive(agentPid), 5000, 'the lost pass ended');
    await pause(1200);
    assert.equal(fake.answersFor(id), 1, 'answered once, not again by the restarted host');

    const id2 = fake.say('after the restart');
    await until(() => fs.existsSync(pidFile), 5000, 'a new pass');
    try { agents.add(JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid); } catch { /* already ended */ }
    await until(() => fake.answersFor(id2) === 1, 8000, 'answer after restart');

    h2.kill('SIGTERM');
    const r = await h2.exited;
    assert.equal(r.code, 0, r.err);
    h2 = null;
    for (const p of agents) assert.equal(alive(p), false, `agent ${p} left running`);
    const logs = allText(path.join(h.home, 'host'));
    assert.ok(!logs.includes(fake.token) && !logs.includes(PREFIX), 'no token in logs');
    assert.ok(!r.err.includes(fake.token) && !r.err.includes(PREFIX), 'no token on stderr');
  } finally {
    for (const c of [h1, h2]) if (c && c.exitCode === null && c.signalCode === null) { c.kill('SIGKILL'); await c.exited; }
    for (const p of agents) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    await fake.close();
    h.cleanup();
  }
});

test('a token file others can read is refused, and the host does not start', async () => {
  const fake = await fakeD2();
  const h = tempHome(fake);
  try {
    fs.chmodSync(h.tokenFile, 0o644);
    const r = await host(h.config).exited;
    assert.equal(r.code, 2);
    assert.match(r.err, /can be read by others: chmod 600 it/);
    assert.equal(fake.statuses.length, 0);
    assert.ok(!r.err.includes(fake.token));
  } finally {
    await fake.close();
    h.cleanup();
  }
});

test('SIGTERM while a pass runs stops the agent too', async () => {
  const fake = await fakeD2();
  const h = tempHome(fake);
  const pidFile = path.join(h.home, 'host', 'state', `${fake.agent}.pass.json`);
  let h1;
  let agentPid;
  try {
    h1 = host(h.config);
    await until(() => fake.statuses.some((s) => s.state === 'up'), 8000, 'host up');
    fake.say('stub:hang');
    await until(() => fs.existsSync(pidFile), 5000, 'the pass started');
    agentPid = JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid;
    h1.kill('SIGTERM');
    const r = await h1.exited;
    assert.equal(r.code, 0, r.err);
    await until(() => !alive(agentPid), 3000, 'agent stopped');
  } finally {
    if (h1 && h1.exitCode === null && h1.signalCode === null) { h1.kill('SIGKILL'); await h1.exited; }
    if (agentPid) { try { process.kill(agentPid, 'SIGKILL'); } catch { /* gone */ } }
    await fake.close();
    h.cleanup();
  }
});
