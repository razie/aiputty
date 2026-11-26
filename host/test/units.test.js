// The small parts: entry lines, scrubbing, token files, config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatEntry, entriesOf, entryKey } from '../lib/seat.js';
import { scrub, addSecret, isTokenish, makeLog } from '../lib/log.js';
import { readTokenFile, loadConfig, ConfigError } from '../lib/config.js';
import { userLine } from '../lib/pass.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aiputty-host-unit-'));

test('entries read as one line each', () => {
  assert.equal(formatEntry({ kind: 'chat', id: 'm1', from: 'ann', chat: 'c9', text: 'hi\nthere ' }), '[m1] chat from ann in chat c9: hi there');
  assert.equal(formatEntry({ kind: 'item', id: 'P-1' }), '[P-1] item');
  assert.equal(formatEntry({ kind: 'mail', id: 'x', urgent: true }), '[x] mail (urgent)');
  assert.deepEqual(entriesOf({ items: [{ id: 'a', kind: 'chat' }, 'junk', null, { kind: 'x' }] }).map(entryKey), ['chat:a']);
  assert.deepEqual(entriesOf(null), []);
});

test('scrub removes known secrets and anything token-shaped', () => {
  const t = ['d2t', 'abcDEF123', 'xyz'].join('_');
  assert.equal(scrub(`Bearer ${t} ok`), 'Bearer <token> ok');
  addSecret('plain-secret-value');
  assert.equal(scrub('a plain-secret-value b'), 'a <token> b');
});

test('a log write never throws: its folder gone, the line is lost and the host goes on', () => {
  const d = tmp();
  const log = makeLog(path.join(d, 'logs', 'a.log'));
  log('kept');
  assert.match(fs.readFileSync(path.join(d, 'logs', 'a.log'), 'utf8'), /kept/);
  fs.rmSync(d, { recursive: true, force: true });
  assert.doesNotThrow(() => log('lost'));
  assert.doesNotThrow(() => log.raw(path.join(d, 'logs', 'a.stream.jsonl'), 'lost\n'));
  assert.equal(fs.existsSync(d), false, 'nothing made again');
});

test('a token in a value is spotted, so no env var carries one to the agent', () => {
  assert.equal(isTokenish(['d2t', 'abc123'].join('_')), true);
  addSecret('another-plain-secret');
  assert.equal(isTokenish('x another-plain-secret'), true);
  assert.equal(isTokenish('/usr/bin:/bin'), false);
});

test('stream-json user line', () => {
  assert.deepEqual(JSON.parse(userLine('hi')), { type: 'user', message: { role: 'user', content: 'hi' } });
});

test('token files: mode 600 only, D2_TOKEN required', () => {
  const d = tmp();
  try {
    const f = path.join(d, 'a.env');
    fs.writeFileSync(f, 'export D2_AGENT=designer-1\nD2_TOKEN="tok-value-123"\n', { mode: 0o600 });
    assert.deepEqual(readTokenFile(f), { agent: 'designer-1', token: 'tok-value-123' });
    fs.chmodSync(f, 0o640);
    assert.throws(() => readTokenFile(f), /can be read by others/);
    fs.chmodSync(f, 0o600);
    fs.writeFileSync(f, 'D2_AGENT=x\n');
    assert.throws(() => readTokenFile(f), /no D2_TOKEN/);
    assert.throws(() => readTokenFile(path.join(d, 'none')), /missing/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('config: project gives the URL; seats need role and tokenFile', () => {
  const d = tmp();
  try {
    const f = path.join(d, 'host.json');
    fs.writeFileSync(f, JSON.stringify({ project: 'acme', home: d, seats: [{ role: 'designer', tokenFile: '/x/t.env' }] }));
    const c = loadConfig(f);
    assert.equal(c.url, 'https://acme.aiputty.com');
    assert.equal(c.agentCmd.command, 'claude');
    assert.equal(c.seats[0].work, path.join(d, 'work', 'acme', 'designer'));
    fs.writeFileSync(f, JSON.stringify({ project: 'acme', seats: [{ role: 'designer' }] }));
    assert.throws(() => loadConfig(f), ConfigError);
    assert.throws(() => loadConfig(path.join(d, 'nope.json')), /cannot read config/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
