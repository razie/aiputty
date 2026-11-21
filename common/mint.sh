#!/bin/bash
# mint.sh - turn a role token into your own agent token.
#
#   mint.sh [--dry] [--follows <agent>] <role>
#
# A role token can only mint. It comes from D2_ROLE_TOKEN, or from a mode-600 file named in
# D2_ROLE_TOKEN_FILE. Never pass it as an argument.
#
# Calls POST /api/v2/tokens/agent {"name": "<role>", "follows"?: "<agent>"} on D2_URL / D2_PROJECT
# (see d2.sh); --follows names the agent whose place you take (a handover). Then writes
#   ${D2_HOME:-~/.d2}/tokens/<agent>.env   D2_TOKEN=... D2_AGENT=... D2_ROLE=...   (mode 600)
#   ${D2_HOME:-~/.d2}/tokens/<agent>.json  {agent, role, expires, follows}  - no token (mode 600)
# and prints one line: the agent name d2 gave you (it may be <role>-2 etc.; use what this prints).
# --dry prints the request instead of sending it (the token is never in it).
#
# Exit: 0 ok, 2 usage, 3 no role token, 4 mint refused, 5 cannot write.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() { echo "usage: mint.sh [--dry] [--follows <agent>] <role>" >&2; exit 2; }
dry=""; follows=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) dry=1; shift ;;
    --follows) [ $# -ge 2 ] || usage; follows=$2; shift 2 ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ $# -eq 1 ] || usage
role=$1
case "$role" in ''|*[!A-Za-z0-9._-]*) echo "mint.sh: role must be letters, digits, . _ -" >&2; exit 2 ;; esac
case "$follows" in *[!A-Za-z0-9._-]*) echo "mint.sh: --follows takes an agent name" >&2; exit 2 ;; esac
d2_need curl python3 || exit 5

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
ROLE="$role" FOLLOWS="$follows" python3 -c '
import json, os
b = {"name": os.environ["ROLE"]}
if os.environ["FOLLOWS"]: b["follows"] = os.environ["FOLLOWS"]
print(json.dumps(b))' > "$tmp/body"
url="$(d2_base)/api/v2/tokens/agent"
if [ -n "$dry" ]; then echo "DRY POST $url"; cat "$tmp/body"; exit 0; fi

rtok=${D2_ROLE_TOKEN:-}
if [ -z "$rtok" ] && [ -n "${D2_ROLE_TOKEN_FILE:-}" ]; then
  d2_private "$D2_ROLE_TOKEN_FILE" || exit 3
  rtok=$(d2_read_var "$D2_ROLE_TOKEN_FILE" D2_ROLE_TOKEN) || true
fi
[ -n "$rtok" ] || { echo "mint.sh: no role token (set D2_ROLE_TOKEN or D2_ROLE_TOKEN_FILE)" >&2; exit 3; }

dir="$(d2_home)/tokens"
( umask 077; mkdir -p "$dir" ) || exit 5
chmod 700 "$dir" 2>/dev/null || true

d2_curl_cfg "$tmp/cfg" "$rtok" ""
unset rtok
code=$(curl -sS --max-time 30 -K "$tmp/cfg" -X POST --data-binary "@$tmp/body" \
  -o "$tmp/out" -w '%{http_code}' "$url") \
  || { echo "mint.sh: network error calling $url" >&2; exit 4; }

# python reads the answer and writes both files itself, so the token never reaches stdout or a log.
CODE="$code" OUT="$tmp/out" DIR="$dir" ROLE="$role" FOLLOWS="$follows" python3 -c '
import json, os, re, sys
e = os.environ
try:
    d = json.load(open(e["OUT"]))
except Exception:
    sys.stderr.write("mint.sh: HTTP %s, the answer was not JSON\n" % e["CODE"]); sys.exit(4)
if not (e["CODE"].startswith("2") and d.get("token") and d.get("agent")):
    err = d.get("error") or {}
    sys.stderr.write("mint.sh: refused, HTTP %s %s %s\n" % (e["CODE"], err.get("code", ""), (err.get("message") or "")[:300]))
    sys.exit(4)
a = d["agent"]
if not re.match(r"^[A-Za-z0-9._-]+$", a):
    sys.stderr.write("mint.sh: odd agent name in the answer\n"); sys.exit(4)
def put(path, text):
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write(text)
    os.chmod(tmp, 0o600); os.replace(tmp, path)
try:
    put(os.path.join(e["DIR"], a + ".env"),
        "# %s: d2 agent token. Do not print, copy or commit.\nD2_TOKEN=%s\nD2_AGENT=%s\nD2_ROLE=%s\n" % (a, d["token"], a, e["ROLE"]))
    put(os.path.join(e["DIR"], a + ".json"),
        json.dumps({"agent": a, "role": d.get("role") or e["ROLE"], "expires": d.get("expires"),
                    "follows": e["FOLLOWS"] or None}, indent=1) + "\n")
except Exception as x:
    sys.stderr.write("mint.sh: cannot write the token files: %s\n" % x); sys.exit(5)
print(a)'
