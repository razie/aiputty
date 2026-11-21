#!/bin/bash
# file.sh - file an item in the pipeline.
#
#   file.sh [options] "<title>" "<summary>"
#
# Options:
#   --doc <file>|-      the item's document (markdown); default none. Your person's words go under ## Prompt.
#   --kind <kind>       e.g. bug, impl, issue, investigate, handover (default: d2's)
#   --role <role>       forRole: the lane it goes to (default: your own role)
#   --for <handle>      forName: a person's handle, never an agent's
#   --size <size>       small | medium | large
#   --touches <a,b>     what it touches (a coder ticket needs them)
#   --chat <id>         links.chat (a handover names its chat)
#   --set key=value     any other field, as json.sh takes it (key:=json for a raw value); repeatable
#   --dry               print the body, send nothing
#
# Checks first, and sends nothing if either fails: the title at most 60 characters, the summary
# (the item's one sentence) at most 200.
# Posts POST /api/v2/cmd/Item/file through d2.sh; prints d2's answer (the new item's id is in it).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() {
  echo 'usage: file.sh [--dry] [--doc file|-] [--kind k] [--role r] [--for handle] [--size s] [--touches a,b]' >&2
  echo '               [--chat id] [--set key=value ...] "<title>" "<summary>"' >&2
  exit 2
}
dry=""; doc=""; kind=""; frole=""; forname=""; size=""; touches=""; chat=""; sets=""
nl='
'
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) dry=1; shift ;;
    --doc|--kind|--role|--for|--size|--touches|--chat|--set)
      [ $# -ge 2 ] || usage
      case "$1" in
        --doc) doc=$2 ;; --kind) kind=$2 ;; --role) frole=$2 ;; --for) forname=$2 ;;
        --size) size=$2 ;; --touches) touches=$2 ;; --chat) chat=$2 ;;
        --set) sets="$sets$2$nl" ;;
      esac
      shift 2 ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ $# -eq 2 ] || usage
d2_need python3 || exit 2
[ -n "$frole" ] || frole=${D2_ROLE:-$(printf '%s' "${D2_AGENT:-}" | sed -E 's/-[0-9]+$//')}
[ -n "$frole" ] || { echo "file.sh: say --role (no D2_ROLE or D2_AGENT to take it from)" >&2; exit 2; }

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/doc"
if [ "$doc" = "-" ]; then cat > "$tmp/doc"
elif [ -n "$doc" ]; then [ -r "$doc" ] || { echo "file.sh: cannot read $doc" >&2; exit 2; }; cat "$doc" > "$tmp/doc"
fi
printf '%s' "$sets" > "$tmp/sets"
set +e
TITLE="$1" SUMMARY="$2" DOC="$tmp/doc" KIND="$kind" FROLE="$frole" FORNAME="$forname" SIZE="$size" \
TOUCHES="$touches" CHAT="$chat" SETS="$tmp/sets" python3 -c '
import json, os, sys
e = os.environ
title, summary = e["TITLE"].strip(), e["SUMMARY"].strip()
bad = []
if not title: bad.append("the title is empty")
if len(title) > 60: bad.append("the title is %d characters (at most 60)" % len(title))
if len(summary) > 200: bad.append("the summary is %d characters (at most 200)" % len(summary))
if bad:
    sys.stderr.write("file.sh: %s; nothing filed\n" % "; ".join(bad)); sys.exit(5)
sys.stderr.write("file.sh: title %d/60, summary %d/200: ok\n" % (len(title), len(summary)))
b = {"title": title, "summary": summary, "doc": open(e["DOC"], encoding="utf-8").read(), "forRole": e["FROLE"]}
if e["KIND"]: b["kind"] = e["KIND"]
if e["FORNAME"]: b["forName"] = e["FORNAME"]
if e["SIZE"]: b["size"] = e["SIZE"]
if e["TOUCHES"]: b["touches"] = [t.strip() for t in e["TOUCHES"].split(",") if t.strip()]
if e["CHAT"]: b["links"] = {"chat": e["CHAT"]}
for a in open(e["SETS"]).read().split("\n"):
    if not a: continue
    k, s, v = a.partition(":=")
    if s and "=" not in k:
        try: b[k] = json.loads(v)
        except ValueError: sys.stderr.write("file.sh: --set %s is not JSON\n" % k); sys.exit(2)
    else:
        k, s, v = a.partition("=")
        if not s or not k: sys.stderr.write("file.sh: --set wants key=value, got %s\n" % a); sys.exit(2)
        b[k] = v
print(json.dumps(b))' > "$tmp/body"
rc=$?
set -e
[ "$rc" -eq 0 ] || exit "$rc"

if [ -n "$dry" ]; then
  "$here/d2.sh" --dry POST /api/v2/cmd/Item/file "$tmp/body"
else
  "$here/d2.sh" POST /api/v2/cmd/Item/file "$tmp/body"
fi
