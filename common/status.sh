#!/bin/bash
# status.sh - tell d2's Agents board how you are doing.
#
#   status.sh [options] <state> "<text>"
#   status.sh --first [options] ["<text>"]          the first status of a run: state up, plus caps
#
# Context (one of these on every status; d2 wants it measured, never guessed):
#   --tokens <n> [--window <n>]   the tokens your session holds now (your last turn's usage) and your
#                                 model's window; d2 works out the %   (window default: D2_WINDOW)
#   --context <0..100|unknown>    a % you measured yourself (unknown only when handing over)
# Other options:
#   --every <s>       how often you promise to report (default 900; d2 caps it by role and state)
#   --workers <n>     how many workers your harness runs beside you (caps.workers on --first; default 0)
#   --working <n>     how many of them hold an item now: sends capacity {working, cap: --workers}
#   --item <P-n>      the item you are on       --chat <id>     the chat (with state chatting)
#   --role <role>     default D2_ROLE, the token file's D2_ROLE, or your agent name without -<n>
#   --dry             print the body instead of sending it
#
# Posts POST /api/v2/cmd/Agent/status through d2.sh; same output and exit codes as d2.sh.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() {
  echo 'usage: status.sh [--dry] [--tokens n [--window n] | --context n] [--every s] [--workers n] [--working n]' >&2
  echo '                 [--item P-n] [--chat id] [--role r] <state> "<text>"' >&2
  echo '       status.sh --first [same options] ["<text>"]' >&2
  exit 2
}
num() { case "$2" in ''|*[!0-9]*) echo "status.sh: $1 must be a whole number" >&2; exit 2 ;; esac; }

dry=""; first=""; tokens=""; window=${D2_WINDOW:-}; context=""; every=900
workers=${D2_WORKERS:-}; working=""; item=""; chat=""; role=${D2_ROLE:-}
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) dry=1; shift ;;
    --first) first=1; shift ;;
    --tokens|--window|--context|--every|--workers|--working|--item|--chat|--role)
      [ $# -ge 2 ] || usage
      case "$1" in
        --tokens) tokens=$2 ;; --window) window=$2 ;; --context) context=$2 ;;
        --every) every=$2 ;; --workers) workers=$2 ;; --working) working=$2 ;;
        --item) item=$2 ;; --chat) chat=$2 ;; --role) role=$2 ;;
      esac
      shift 2 ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
if [ -n "$first" ]; then
  [ $# -le 1 ] || usage
  state=up; text=${1:-starting}
else
  [ $# -eq 2 ] || usage
  state=$1; text=$2
fi
num --every "$every"
[ -z "$tokens" ] || num --tokens "$tokens"
[ -z "$window" ] || num --window "$window"
[ -z "$workers" ] || num --workers "$workers"
[ -z "$working" ] || num --working "$working"
case "$context" in ''|unknown) ;; *[!0-9]*) echo "status.sh: --context is 0..100 or unknown" >&2; exit 2 ;; esac
[ -n "$tokens$context" ] || { echo "status.sh: say your context: --tokens <n> --window <n> (measured), or --context <0..100>" >&2; exit 2; }
[ -z "$working" ] || [ -n "$workers" ] || { echo "status.sh: --working needs --workers (your cap)" >&2; exit 2; }
d2_need python3 || exit 2

agent=${D2_AGENT:-}
tf=${D2_TOKEN_FILE:-}
[ -n "$tf" ] || [ -z "$agent" ] || tf="$(d2_home)/tokens/$agent.env"
if [ -n "$tf" ] && [ -f "$tf" ]; then
  [ -n "$agent" ] || agent=$(d2_read_var "$tf" D2_AGENT 2>/dev/null) || true
  [ -n "$role" ] || role=$(d2_read_var "$tf" D2_ROLE 2>/dev/null) || true
fi
[ -n "$agent" ] || { echo "status.sh: D2_AGENT is not set" >&2; exit 2; }
if [ -z "$role" ]; then
  role=$(printf '%s' "$agent" | sed -E 's/-[0-9]+$//')
  echo "status.sh: no D2_ROLE, taking role $role from the agent name" >&2
fi

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
AGENT="$agent" ROLE="$role" STATE="$state" TEXT="$text" EVERY="$every" FIRST="$first" \
TOKENS="$tokens" WINDOW="$window" CONTEXT="$context" WORKERS="$workers" WORKING="$working" \
ITEM="$item" CHAT="$chat" HARNESS="${D2_HARNESS:-claude-code}" python3 -c '
import json, os
e = os.environ
b = {"agent": e["AGENT"], "role": e["ROLE"], "state": e["STATE"], "every": int(e["EVERY"]), "text": e["TEXT"]}
if e["TOKENS"]:
    b["contextTokens"] = int(e["TOKENS"])
    if e["WINDOW"]: b["window"] = int(e["WINDOW"])
if e["CONTEXT"]:
    b["context"] = e["CONTEXT"] if e["CONTEXT"] == "unknown" else int(e["CONTEXT"])
if e["FIRST"]:
    b["caps"] = {"workers": int(e["WORKERS"] or 0), "harness": e["HARNESS"]}
if e["WORKING"]:
    b["capacity"] = {"working": int(e["WORKING"]), "cap": int(e["WORKERS"])}
if e["ITEM"]: b["item"] = e["ITEM"]
if e["CHAT"]: b["chat"] = e["CHAT"]
print(json.dumps(b))' > "$tmp/body"

if [ -n "$dry" ]; then
  "$here/d2.sh" --dry POST /api/v2/cmd/Agent/status "$tmp/body"
else
  D2_AGENT="$agent" "$here/d2.sh" POST /api/v2/cmd/Agent/status "$tmp/body"
fi
