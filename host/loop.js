#!/usr/bin/env node
// loop.js - the d2 agent host: one loop per seat (DesignMacHost, slice 1).
//
//   node host/loop.js [--config <host.json>]      (default ~/.d2/host/host.json)
//
// Each seat reads its own agent's /agents/next with its own token and runs one Claude Code pass when
// something waits. Tokens stay in their mode-600 files and in this process's memory: never on a command
// line, never in a log. SIGTERM or SIGINT stops every seat and the passes they run.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, DEFAULT_CONFIG, loadConfig, readTokenFile } from './lib/config.js';
import { Seat } from './lib/seat.js';
import { makeLog } from './lib/log.js';

export function parseArgs(argv) {
  const out = { config: DEFAULT_CONFIG };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' && argv[i + 1]) out.config = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new ConfigError(`unknown argument ${a}`);
  }
  return out;
}

export async function main(argv) {
  let args, cfg;
  try {
    args = parseArgs(argv);
    if (args.help) {
      process.stdout.write('usage: node host/loop.js [--config <host.json>]\n');
      return 0;
    }
    cfg = loadConfig(args.config);
  } catch (e) {
    process.stderr.write(`loop.js: ${e.message}\n`);
    return 2;
  }
  const log = makeLog(path.join(cfg.home, 'host', 'logs', 'host.log'), { echo: true });
  const seats = [];
  for (const s of cfg.seats) {
    let tok;
    try { tok = readTokenFile(s.tokenFile); } catch (e) {
      log(`seat ${s.role} not started: ${e.message}`);
      continue;
    }
    const agent = s.agent || tok.agent;
    if (!agent) { log(`seat ${s.role} not started: ${s.tokenFile} has no D2_AGENT line and the seat names no agent`); continue; }
    seats.push(new Seat({
      url: cfg.url, project: cfg.project, role: s.role, agent, token: tok.token, tokenFile: s.tokenFile,
      work: s.work, home: cfg.home, startedBy: cfg.startedBy, agentCmd: cfg.agentCmd,
    }));
  }
  if (!seats.length) { log('no seat could start'); return 2; }
  const stop = (sig) => { log(`${sig}: stopping ${seats.length} seat(s)`); for (const s of seats) s.stop(); };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  log(`host up (pid ${process.pid}): ${seats.map((s) => `${s.role}=${s.agent}`).join(', ')}`);
  const ends = await Promise.all(seats.map((s) => s.run().catch((e) => { log(`seat ${s.agent} crashed: ${e.stack || e}`); return 'crashed'; })));
  log(`host down: ${ends.join(', ')}`);
  return ends.every((e) => e === 'revoked') ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
