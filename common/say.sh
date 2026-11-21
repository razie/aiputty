#!/bin/bash
# say.sh - answer in a d2 chat, naming the messages you answer.
#
#   say.sh [options] <chat id> "<text>"|- <answered id> [<id> ...]
#   say.sh [options] --none <chat id> "<text>"|-              answers nothing (nothing is open)
#   say.sh [options] --progress <chat id> "<text>"|- [<id>]   a note on the way; the ids it is on
#
# The answers rule: name every message of your person's you were handed and are answering. A reply
# naming none leaves them open; the 4th such reply in a row is refused (409 E_ANSWERS).
#
# Checks the reply limits before sending, and says so: with the chat's pad off, d2 takes at most
# 1200 characters and 25 lines (413 E_TOO_LONG otherwise; a long message answered widens it, at most
# 3000 / 40). Over the limit nothing is sent. --max-chars / --max-lines set a wider one you know of.
#
# Options: --dry (print the body, send nothing)  --tokens <n> (the turn's tokens)
#          --max-chars <n> --max-lines <n>
# Posts POST /api/v2/cmd/chat/<id>/say through d2.sh. Exit: as d2.sh; 5 over the limit.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() {
  echo 'usage: say.sh [--dry] [--tokens n] [--max-chars n] [--max-lines n] <chat id> "<text>"|- <answered id> [<id> ...]' >&2
  echo '       say.sh [...] --none <chat id> "<text>"|-      or  --progress <chat id> "<text>"|- [<id>]' >&2
  exit 2
}
dry=""; mode=answers; tokens=""; maxc=1200; maxl=25
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) dry=1; shift ;;
    --none) mode=none; shift ;;
    --progress) mode=progress; shift ;;
    --tokens|--max-chars|--max-lines)
      [ $# -ge 2 ] || usage
      case "$2" in ''|*[!0-9]*) echo "say.sh: $1 must be a whole number" >&2; exit 2 ;; esac
      case "$1" in --tokens) tokens=$2 ;; --max-chars) maxc=$2 ;; --max-lines) maxl=$2 ;; esac
      shift 2 ;;
    -*) [ "$1" = "-" ] && break; usage ;;
    *) break ;;
  esac
done
[ $# -ge 2 ] || usage
chat=$1; text=$2; shift 2
case "$chat" in *[!A-Za-z0-9]*|'') echo "say.sh: odd chat id: $chat" >&2; exit 2 ;; esac
ids=""
[ $# -eq 0 ] || ids=$(printf '%s ' "$@" | tr ',' ' ' | sed -E 's/^ +//; s/ +$//')
for i in $ids; do case "$i" in *[!A-Za-z0-9]*) echo "say.sh: odd message id: $i" >&2; exit 2 ;; esac; done
if [ "$mode" = answers ] && [ -z "$ids" ]; then
  echo "say.sh: name the message ids you answer (the answers rule), or say --none / --progress" >&2; exit 2
fi
[ "$mode" != none ] || [ -z "$ids" ] || { echo "say.sh: --none takes no ids" >&2; exit 2; }
[ "$maxc" -le 3000 ] || maxc=3000
[ "$maxl" -le 40 ] || maxl=40
d2_need python3 || exit 2

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
d2_text "$text" "$tmp/text"
set +e
TEXT="$tmp/text" IDS="$ids" MODE="$mode" TOKENS="$tokens" MAXC="$maxc" MAXL="$maxl" python3 -c '
import json, os, sys
e = os.environ
t = open(e["TEXT"], encoding="utf-8").read().strip("\n")
chars, lines = len(t), t.count("\n") + 1
maxc, maxl = int(e["MAXC"]), int(e["MAXL"])
if not t.strip():
    sys.stderr.write("say.sh: the text is empty; nothing sent\n"); sys.exit(2)
if chars > maxc or lines > maxl:
    sys.stderr.write("say.sh: too long: %d characters, %d lines (the limit is %d / %d); nothing sent. "
                     "Say it shorter in the chat; never send a pad link instead.\n" % (chars, lines, maxc, maxl))
    sys.exit(5)
sys.stderr.write("say.sh: %d characters, %d lines: within the limit (%d / %d)\n" % (chars, lines, maxc, maxl))
ids = e["IDS"].split()
b = {"text": t}
if e["MODE"] == "progress":
    b["progress"] = True
    if ids: b["on"] = ids
else:
    b["answers"] = ids
if e["TOKENS"]: b["tokens"] = int(e["TOKENS"])
print(json.dumps(b))' > "$tmp/body"
rc=$?
set -e
[ "$rc" -eq 0 ] || exit "$rc"

if [ -n "$dry" ]; then
  "$here/d2.sh" --dry POST "/api/v2/cmd/chat/$chat/say" "$tmp/body"
else
  "$here/d2.sh" POST "/api/v2/cmd/chat/$chat/say" "$tmp/body"
fi
