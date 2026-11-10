#!/usr/bin/env bash
# mint.sh - turn a role token into your own agent token.
#
#   mint.sh <role>
#
# A role token can only mint. It comes from D2_ROLE_TOKEN, or from a mode-600 file named in
# D2_ROLE_TOKEN_FILE. Never pass it as an argument.
#
# Calls POST /api/v2/tokens/agent {"name": "<role>"} on D2_URL / D2_PROJECT (see d2.sh), then writes
#   ${D2_HOME:-~/.d2}/tokens/<agent>.env   D2_AGENT_TOKEN=... D2_AGENT=... D2_ROLE=...   (mode 600)
#   ${D2_HOME:-~/.d2}/tokens/<agent>.json  {agent, role, expires}  - no token        (mode 600)
# and prints one line: the agent name d2 gave you (it may be <role>-2 etc.; use what this prints).
#
# Exit: 0 ok, 2 usage, 3 no role token, 4 mint refused, 5 cannot write.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

[ $# -eq 1 ] || { echo "usage: mint.sh <role>" >&2; exit 2; }
role=$1
case "$role" in ''|*[!A-Za-z0-9._-]*) echo "mint.sh: role must be letters, digits, . _ -" >&2; exit 2 ;; esac
command -v node >/dev/null || { echo "mint.sh: needs node on PATH" >&2; exit 5; }

rtok=${D2_ROLE_TOKEN:-}
if [ -z "$rtok" ] && [ -n "${D2_ROLE_TOKEN_FILE:-}" ]; then
  d2_private "$D2_ROLE_TOKEN_FILE" || exit 3
  rtok=$(d2_read_var "$D2_ROLE_TOKEN_FILE" D2_ROLE_TOKEN) || true
fi
[ -n "$rtok" ] || { echo "mint.sh: no role token (set D2_ROLE_TOKEN or D2_ROLE_TOKEN_FILE)" >&2; exit 3; }

dir="$(d2_home)/tokens"
( umask 077; mkdir -p "$dir" ) || exit 5
chmod 700 "$dir" 2>/dev/null || true

tmp=$(mktemp -d "${TMPDIR:-/tmp}/d2mint.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
d2_curl_cfg "$tmp/cfg" "$rtok" ""
unset rtok
printf '{"name":"%s"}' "$role" > "$tmp/body"

code=$(curl -sS --max-time 30 -K "$tmp/cfg" -X POST --data-binary "@$tmp/body" \
  -o "$tmp/out" -w '%{http_code}' "$(d2_base)/api/v2/tokens/agent") \
  || { echo "mint.sh: network error calling $(d2_base)" >&2; exit 4; }

# node reads the answer and writes both files itself, so the token never reaches stdout or a log.
CODE="$code" OUT="$tmp/out" DIR="$dir" ROLE="$role" node -e '
const fs = require("fs"), path = require("path");
const { CODE, OUT, DIR, ROLE } = process.env;
let d;
try { d = JSON.parse(fs.readFileSync(OUT, "utf8")); }
catch (e) { console.error(`mint.sh: HTTP ${CODE}, answer was not JSON`); process.exit(4); }
if (!/^2/.test(CODE) || !d.token || !d.agent) {
  const e = d.error || {};
  console.error(`mint.sh: refused, HTTP ${CODE} ${e.code || ""} ${(e.message || "").slice(0, 300)}`);
  process.exit(4);
}
if (!/^[A-Za-z0-9._-]+$/.test(d.agent)) { console.error("mint.sh: odd agent name in answer"); process.exit(4); }
const put = (file, text) => {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
};
try {
  put(path.join(DIR, d.agent + ".env"),
    `# ${d.agent}: d2 agent token. Do not print, copy or commit.\n` +
    `D2_AGENT_TOKEN=${d.token}\nD2_AGENT=${d.agent}\nD2_ROLE=${ROLE}\n`);
  put(path.join(DIR, d.agent + ".json"),
    JSON.stringify({ agent: d.agent, role: d.role || ROLE, expires: d.expires || null }, null, 1) + "\n");
} catch (e) { console.error("mint.sh: cannot write token files: " + e.message); process.exit(5); }
console.log(d.agent);
'
