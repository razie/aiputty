#!/bin/bash
# note.sh - add a note to a pipeline item.
#
#   note.sh [--dry] <item id> "<text>"|-
#
#   common/note.sh P-4231 "Checked on d2spec: the panel opens; ui:CHAT-3 passes."
#   common/note.sh P-4231 - < note.md
#
# An OK from your person reads: approved by <person> in <chat id>.
# Posts POST /api/v2/cmd/Item/<id>/note {text} through d2.sh; same output and exit codes as d2.sh.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() { echo 'usage: note.sh [--dry] <item id> "<text>"|-' >&2; exit 2; }
dry=""
[ "${1:-}" != "--dry" ] || { dry=1; shift; }
[ $# -eq 2 ] || usage
item=$1
case "$item" in *[!A-Za-z0-9-]*|'') echo "note.sh: odd item id: $item" >&2; exit 2 ;; esac
d2_need python3 || exit 2

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
d2_text "$2" "$tmp/text"
TEXT="$tmp/text" python3 -c '
import json, os, sys
t = open(os.environ["TEXT"], encoding="utf-8").read().strip()
if not t: sys.stderr.write("note.sh: the note is empty; nothing sent\n"); sys.exit(2)
print(json.dumps({"text": t}))' > "$tmp/body"

if [ -n "$dry" ]; then
  "$here/d2.sh" --dry POST "/api/v2/cmd/Item/$item/note" "$tmp/body"
else
  "$here/d2.sh" POST "/api/v2/cmd/Item/$item/note" "$tmp/body"
fi
