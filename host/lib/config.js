// config.js - the host's config file and the seats' token files.
//
// host.json (slice 1 writes it by hand; `d2-host init` will in slice 2):
//   {
//     "project": "myproject",               // d2 project; the URL is https://<project>.aiputty.com
//     "url": "https://myproject.aiputty.com", // optional, wins over project
//     "startedBy": "<you>",                  // who the seats' statuses say started them
//     "claude": "claude",                    // the Claude Code command (a path if it isn't on PATH)
//     "home": "~/.d2",                       // where the host keeps logs and pass state
//     "seats": [ { "role": "designer", "tokenFile": "~/.d2/tokens/<agent>.env", "work": "~/.d2/work/<project>/designer" } ]
//   }
// A token file is KEY=value lines, as common/mint.sh writes: D2_AGENT=<agent name>, D2_TOKEN=<agent token>.
// It must be mode 600 (no group or other bits): the host refuses a seat whose file others can read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = path.join(os.homedir(), '.d2', 'host', 'host.json');

export function expand(p) {
  if (typeof p !== 'string' || !p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export class ConfigError extends Error {}

/** Read KEY=value lines (optional `export`, optional quotes); no shell is run. */
export function readEnvFile(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** The seat's agent name and token from its token file; refuses a file group or others can read. */
export function readTokenFile(file) {
  let st;
  try { st = fs.statSync(file); } catch { throw new ConfigError(`token file ${file} is missing`); }
  if (!st.isFile()) throw new ConfigError(`token file ${file} is not a file`);
  if (st.mode & 0o077) throw new ConfigError(`token file ${file} can be read by others: chmod 600 it`);
  const vars = readEnvFile(file);
  const token = vars.D2_TOKEN || vars.D2_AGENT_TOKEN || vars.D2_BUILDER || '';
  if (!token) throw new ConfigError(`token file ${file} has no D2_TOKEN line`);
  return { agent: vars.D2_AGENT || '', token };
}

export function loadConfig(file = DEFAULT_CONFIG) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new ConfigError(`cannot read config ${file}: ${e.code || e.message}`);
  }
  const url = (cfg.url || (cfg.project ? `https://${cfg.project}.aiputty.com` : '')).replace(/\/+$/, '');
  if (!url) throw new ConfigError('config needs "project" or "url"');
  const project = cfg.project || new URL(url).hostname.split('.')[0];
  const home = expand(cfg.home || '~/.d2');
  if (!Array.isArray(cfg.seats) || cfg.seats.length === 0) throw new ConfigError('config needs at least one seat');
  const seats = cfg.seats.map((s, i) => {
    if (!s || !s.role || !s.tokenFile) throw new ConfigError(`seat ${i + 1} needs "role" and "tokenFile"`);
    return {
      role: String(s.role),
      tokenFile: expand(s.tokenFile),
      agent: s.agent ? String(s.agent) : '',
      work: expand(s.work || path.join(home, 'work', project, String(s.role))),
    };
  });
  const agentCmd = Array.isArray(cfg.claude)
    ? { command: expand(cfg.claude[0]), args: cfg.claude.slice(1) }
    : { command: expand(cfg.claude || 'claude'), args: [] };
  return { url, project, home, startedBy: cfg.startedBy || 'd2-host', seats, agentCmd };
}
