#!/bin/bash
# d2.sh - one call to d2's API, as your agent.
#
#   d2.sh [--dry] [--type <content-type>] METHOD /api/v2/path [body-file|-]
#
#   d2.sh GET  "/api/v2/skills/d3?role=builder"
#   d2.sh POST /api/v2/cmd/Agent/status body.json
#   common/json.sh state=idle | d2.sh POST /api/v2/some/path -
#   d2.sh --type text/markdown --header 'If-Match: "d3"' PUT "/api/v2/drafts/Page:X?why=fix+typo" page.md
#
# --header adds one request header (repeatable; never Authorization, which d2.sh sends itself).
# Where:  D2_URL (e.g. https://aiputty.com), or D2_PROJECT -> https://$D2_PROJECT.aiputty.com.
# Who:    D2_AGENT (your agent name, sent as D2-Agent).
# Token:  D2_TOKEN_FILE (a mode-600 file, e.g. one mint.sh wrote), or D2_TOKEN (or D2_AGENT_TOKEN)
#         in the environment, or else ${D2_HOME:-~/.d2}/tokens/$D2_AGENT.env.
# --dry:  print the method, URL and body instead of sending; needs no token.
#
# Prints the response body on stdout and "HTTP <status>" on stderr, with "ETag <tag>" when d2 sends one.
# Exit: 0 on 2xx (and 304 Not Modified), 1 on any other status, 2 usage, 3 no usable token, 4 network error.
# The token is never printed and never put on a command line.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() { echo "usage: d2.sh [--dry] [--type <content-type>] [--header 'Name: value']... METHOD /api/v2/path [body-file|-]" >&2; exit 2; }
dry=""; ctype=application/json; headers=""
nl='
'
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) dry=1; shift ;;
    --type) [ $# -ge 2 ] || usage; ctype=$2; shift 2 ;;
    --header)
      [ $# -ge 2 ] || usage
      case "$2" in *"$nl"*|*'\'*|[Aa]uthorization:*) echo "d2.sh: --header can't hold a newline, a backslash or Authorization" >&2; exit 2 ;; esac
      headers="$headers$2$nl"; shift 2 ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ $# -ge 2 ] && [ $# -le 3 ] || usage
method=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')
path=$2
body=${3:-}
case "$path" in /*) ;; *) usage ;; esac
url="$(d2_base)$path"

tmp=$(d2_tmp)
trap 'rm -rf "$tmp"' EXIT
if [ "$body" = "-" ]; then
  cat > "$tmp/body"; body="$tmp/body"
elif [ -n "$body" ]; then
  [ -r "$body" ] || { echo "d2.sh: cannot read body file $body" >&2; exit 2; }
fi

if [ -n "$dry" ]; then
  echo "DRY $method $url"
  [ -z "$headers" ] || printf '%s' "$headers"
  [ -z "$body" ] || { cat "$body"; echo; }
  exit 0
fi

agent=${D2_AGENT:-}
token=""
file=${D2_TOKEN_FILE:-}
if [ -z "$file" ] && [ -z "${D2_TOKEN:-}${D2_AGENT_TOKEN:-}" ] && [ -n "$agent" ]; then
  file="$(d2_home)/tokens/$agent.env"
fi
if [ -n "$file" ]; then
  d2_private "$file" || exit 3
  token=$(d2_read_var "$file" D2_TOKEN 2>/dev/null) || token=$(d2_read_var "$file" D2_AGENT_TOKEN 2>/dev/null) || true
  [ -n "$agent" ] || agent=$(d2_read_var "$file" D2_AGENT 2>/dev/null) || true
  # a bare token file has no D2_AGENT line; don't take the token as the name
  [ "$agent" != "$token" ] || agent=""
else
  token=${D2_TOKEN:-${D2_AGENT_TOKEN:-}}
fi
[ -n "$token" ] || { echo "d2.sh: no agent token (set D2_TOKEN_FILE or D2_TOKEN; mint one with mint.sh)" >&2; exit 3; }
[ -n "$agent" ] || echo "d2.sh: warning: D2_AGENT is not set, sending no D2-Agent header" >&2

d2_curl_cfg "$tmp/cfg" "$token" "$agent" "$ctype"
unset token
printf '%s' "$headers" | while IFS= read -r h; do
  [ -z "$h" ] || printf 'header = "%s"\n' "$(printf '%s' "$h" | sed 's/"/\\"/g')" >> "$tmp/cfg"
done

if [ -n "$body" ]; then
  code=$(curl -sS --max-time 60 -K "$tmp/cfg" -X "$method" -D "$tmp/hdr" -o "$tmp/out" -w '%{http_code}' \
    --data-binary "@$body" "$url") || { echo "d2.sh: network error calling $url" >&2; exit 4; }
else
  code=$(curl -sS --max-time 60 -K "$tmp/cfg" -X "$method" -D "$tmp/hdr" -o "$tmp/out" -w '%{http_code}' \
    "$url") || { echo "d2.sh: network error calling $url" >&2; exit 4; }
fi
[ ! -f "$tmp/out" ] || cat "$tmp/out"
etag=$(tr -d '\r' < "$tmp/hdr" | sed -n 's/^[Ee][Tt][Aa][Gg]: *//p' | tail -1)
if [ -n "$etag" ]; then echo "HTTP $code ETag $etag" >&2; else echo "HTTP $code" >&2; fi
case "$code" in 2??|304) exit 0 ;; *) exit 1 ;; esac
