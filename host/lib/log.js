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

/** Whether the text holds a known secret or anything token-shaped. */
export function isTokenish(text) {
  const s = String(text);
  for (const v of known) if (s.includes(v)) return true;
  return s.includes(PREFIX);
}

/** A logger writing scrubbed lines to `file` (mode 600) and, when `echo`, to stderr. */
export function makeLog(file, { echo = false } = {}) {
  // A log write never throws: a full disk or a removed folder must not crash the host (an unhandled
  // rejection from a status call nobody awaits ends a Node 24 process).
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const append = (f, text) => {
    try { fs.appendFileSync(f, text, { mode: 0o600 }); } catch { /* the line is lost, the host goes on */ }
  };
  const write = (line) => {
    const out = scrub(line) + '\n';
    if (file) append(file, out);
    if (echo) process.stderr.write(out);
  };
  const log = (...parts) => write(`${new Date().toISOString()} ${parts.join(' ')}`);
  log.raw = (file2, text) => append(file2, scrub(text));
  return log;
}
