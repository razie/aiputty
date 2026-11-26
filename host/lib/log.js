// log.js - one line per event, with every token scrubbed out before it is written anywhere.
//
// Two scrubs: every token value the host has loaded (exact match), and anything shaped like a d2 token
// (the prefix is built at run time so this file never holds it literally).
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = ['d2t', ''].join('_');
const SHAPE = new RegExp(PREFIX + '[A-Za-z0-9_\\-.]+', 'g');
const known = new Set();

/** Remember a secret value so every later log line and stream copy scrubs it. */
export function addSecret(value) {
  if (typeof value === 'string' && value.length >= 8) known.add(value);
}

/** The text with every known secret and anything token-shaped replaced by `<token>`. */
export function scrub(text) {
  let s = String(text);
  for (const v of known) if (s.includes(v)) s = s.split(v).join('<token>');
  return s.replace(SHAPE, '<token>');
}

/** A logger writing scrubbed lines to `file` (mode 600) and, when `echo`, to stderr. */
export function makeLog(file, { echo = false } = {}) {
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const write = (line) => {
    const out = scrub(line) + '\n';
    if (file) {
      fs.appendFileSync(file, out, { mode: 0o600 });
    }
    if (echo) process.stderr.write(out);
  };
  const log = (...parts) => write(`${new Date().toISOString()} ${parts.join(' ')}`);
  log.raw = (file2, text) => {
    fs.mkdirSync(path.dirname(file2), { recursive: true, mode: 0o700 });
    fs.appendFileSync(file2, scrub(text), { mode: 0o600 });
  };
  return log;
}
