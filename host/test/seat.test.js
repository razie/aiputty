// The seat loop against a fake d2 and a stub agent: one answer per message, chat words change nothing,
// a silent stream kills the pass, three failures back off, a refused token stops the seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fakeD2 } from '../testkit/fake-d2.js';
import { tempHome, makeSeat, until, pause, alive, allText } from '../testkit/env.js';

async function setup(t, timing) {
  const fake = await fakeD2();
  const h = tempHome(fake);
  const seat = makeSeat(fake, h, timing);
  const running = seat.run();
  const pids = new Set();
  const spy = setInterval(() => { if (seat.pass?.pid) pids.add(seat.pass.pid); }, 5);
  // a failed assertion must still stop the seat, its agents and the fake: nothing left running
  t.after(async () => {
    seat.stop();
    await running;
    clearInterval(spy);
    for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    await fake.close().catch(() => {});
    h.cleanup();
  });
  await until(() => fake.statuses.some((s) => s.state === 'up'), 5000, 'status up');
  const done = async () => {
    seat.stop();
    const end = await running;
    clearInterval(spy);
    for (const p of pids) assert.equal(alive(p), false, `agent pid ${p} left running`);
    const logs = allText(path.join(h.home, 'host'));
    return { end, logs };
  };
  return { fake, h, seat, running, pids, done };
}

test('one answer per message, entries arriving mid-pass go into the same pass, the next pass resumes', async (t) => {
  const { fake, seat, pids, done } = await setup(t);
  const a = fake.say('stub:slow=400 first');
  const b = fake.say('second');
  await until(() => seat.pass, 3000, 'a pass');
  const firstPid = seat.pass.pid;
  const c = fake.say('third, mid-pass');
  await until(() => [a, b, c].every((id) => fake.answersFor(id) === 1), 6000, 'three answers');
  for (const id of [a, b, c]) {
    const ans = fake.answers.find((x) => x.id === id);
    assert.match(ans.text, new RegExp(`^stub ${firstPid} `), `${id} answered by the first pass`);
  }
  await until(() => !seat.pass, 3000, 'pass end');
  const d = fake.say('later');
  await until(() => fake.answersFor(d) === 1, 5000, 'answer to later');
  assert.match(fake.answers.find((x) => x.id === d).text, / resumed answers /, 'the second pass resumes the session');
  await pause(400);
  for (const id of [a, b, c, d]) assert.equal(fake.answersFor(id), 1, `${id} answered once`);
  assert.deepEqual(fake.starts, ['pass,minted'], 'one start prompt, from d2, for the fresh session only');
  assert.ok(pids.size >= 2);
  const beats = fake.statuses.filter((s) => s.state === 'idle' || s.state === 'working');
  assert.ok(beats.length >= 2, 'heartbeats posted');
  for (const s of fake.statuses) {
    assert.equal(s.agent, fake.agent);
    assert.equal(s.startedBy, 'tester');
    assert.ok(s.text.length <= 300);
  }
  assert.ok(fake.statuses.some((s) => s.context > 0), 'context measured from the stream');
  const { end, logs } = await done();
  assert.equal(end, 'stopped');
  assert.ok(!logs.includes(fake.token), 'no token in logs');
  assert.ok(!logs.includes(['d2t', ''].join('_')), 'nothing token-shaped in logs');
});

test('"handover", "bye" and "stop" in a chat change nothing', async (t) => {
  const { fake, seat, done } = await setup(t);
  const ids = ['bye', 'handover', 'stop', 'stop the host now'].map((w) => fake.say(w));
  await until(() => ids.every((id) => fake.answersFor(id) === 1), 5000, 'answers to the words');
  await until(() => !seat.pass, 3000, 'pass end');
  await pause(300);
  assert.equal(seat.stopping, false, 'the seat still runs');
  const after = fake.say('hello again');
  await until(() => fake.answersFor(after) === 1, 5000, 'answer after the words');
  for (const id of ids) assert.equal(fake.answersFor(id), 1);
  assert.ok(!fake.statuses.some((s) => s.state === 'done'), 'no done posted by the host');
  const { end } = await done();
  assert.equal(end, 'stopped');
});

test('a silent stream kills the pass, and the entry comes again', async (t) => {
  const { fake, seat, done } = await setup(t, { stallMs: 300, failLimit: 99 });
  const id = fake.say('stub:hang');
  await until(() => seat.pass, 3000, 'a pass');
  const pid = seat.pass.pid;
  const t0 = Date.now();
  await until(() => !alive(pid), 3000, 'the silent pass killed');
  assert.ok(Date.now() - t0 < 2500);
  await until(() => seat.fails >= 1, 2000, 'failure counted');
  assert.equal(fake.answersFor(id), 0);
  assert.ok(fake.pending.includes(id), 'still waiting in d2: the host keeps no cursor');
  await until(() => seat.passes >= 2, 3000, 'handed again in a new pass');
  const { logs } = await done();
  assert.match(logs, /no output for 0 s: killed|no output for \d+ s: killed/);
});

test('three failed passes back off, with one line to the chat', async (t) => {
  const { fake, seat, done } = await setup(t, { failLimit: 3, backoffMs: 60_000 });
  fake.say('stub:crash');
  await until(() => fake.alerts.length === 1, 6000, 'the back-off alert');
  assert.equal(seat.passes, 3);
  const al = fake.alerts[0];
  assert.equal(al.kind, 'crash');
  assert.equal(al.chat, 'chat-1');
  assert.equal(al.agent, fake.agent);
  assert.match(al.text, /3 passes failed in a row .*exit 3/);
  await until(() => fake.statuses.some((s) => s.state === 'waiting'), 2000, 'waiting status');
  await pause(600);
  assert.equal(seat.passes, 3, 'no pass during the back-off');
  assert.equal(fake.alerts.length, 1, 'said once');
  await done();
});

test('a refused token stops the seat', async (t) => {
  const { fake, done } = await setup(t);
  fake.revoke();
  const { end } = await done();
  assert.ok(end === 'revoked' || end === 'stopped');
});

test('a refused token mid-run ends the loop by itself', async (t) => {
  const { fake, running } = await setup(t);
  fake.revoke();
  assert.equal(await running, 'revoked');
});
