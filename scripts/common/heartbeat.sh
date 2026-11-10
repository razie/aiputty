#!/usr/bin/env bash
# heartbeat.sh - tell d2's Agents board how you are doing.
#
#   heartbeat.sh --first ["<text>"] [every-seconds]   first status of a run: state "up", plus caps
#   heartbeat.sh <state> "<text>" [every-seconds]     every status after that
#
# every-seconds is how often you promise to report (default 300).
# Needs D2_AGENT and D2_ROLE (mint.sh puts both in your .env), and a token as for d2.sh.
# Posts POST /api/v2/cmd/Agent/status through d2.sh; same output and exit codes as d2.sh.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() {
  echo 'usage: heartbeat.sh <state> "<text>" [every-seconds]' >&2
  echo '       heartbeat.sh --first ["<text>"] [every-seconds]' >&2
  exit 2
}
first=""
if [ "${1:-}" = "--first" ]; then
  first=1; shift
  state=up; text=${1:-starting}; every=${2:-300}
  [ $# -le 2 ] || usage
else
  [ $# -ge 2 ] && [ $# -le 3 ] || usage
  state=$1; text=$2; every=${3:-300}
fi
case "$every" in ''|*[!0-9]*) echo "heartbeat.sh: every-seconds must be a number" >&2; exit 2 ;; esac
command -v node >/dev/null || { echo "heartbeat.sh: needs node on PATH" >&2; exit 2; }

agent=${D2_AGENT:-}
role=${D2_ROLE:-}
if [ -n "${D2_TOKEN_FILE:-}" ] && [ -f "$D2_TOKEN_FILE" ]; then
  [ -n "$agent" ] || agent=$(d2_read_var "$D2_TOKEN_FILE" D2_AGENT 2>/dev/null) || true
  [ -n "$role" ] || role=$(d2_read_var "$D2_TOKEN_FILE" D2_ROLE 2>/dev/null) || true
fi
if [ -z "$role" ] && [ -n "$agent" ] && [ -f "$(d2_home)/tokens/$agent.env" ]; then
  role=$(d2_read_var "$(d2_home)/tokens/$agent.env" D2_ROLE 2>/dev/null) || true
fi
[ -n "$agent" ] || { echo "heartbeat.sh: D2_AGENT is not set" >&2; exit 2; }
[ -n "$role" ] || { echo "heartbeat.sh: D2_ROLE is not set" >&2; exit 2; }

AGENT="$agent" ROLE="$role" STATE="$state" TEXT="$text" EVERY="$every" FIRST="$first" node -e '
const e = process.env;
const b = { agent: e.AGENT, role: e.ROLE, state: e.STATE, every: Number(e.EVERY), text: e.TEXT, context: "unknown" };
if (e.FIRST) b.caps = { workers: 0, harness: "claude-code" };
process.stdout.write(JSON.stringify(b));
' | D2_AGENT="$agent" "$here/d2.sh" POST /api/v2/cmd/Agent/status -
