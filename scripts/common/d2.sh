#!/usr/bin/env bash
# d2.sh - one call to d2's API, as your agent.
#
#   d2.sh METHOD /api/v2/path [body-file|-]
#
#   d2.sh GET  /api/v2/skills/d3?role=builder
#   d2.sh POST /api/v2/cmd/Agent/status body.json
#   echo '{"a":1}' | d2.sh POST /api/v2/some/path -
#
# Where:  D2_URL (e.g. https://aiputty.com), or D2_PROJECT -> https://$D2_PROJECT.aiputty.com.
# Who:    D2_AGENT (your agent name, sent as D2-Agent).
# Token:  D2_TOKEN_FILE (a mode-600 file, e.g. one mint.sh wrote), or D2_AGENT_TOKEN,
#         or else ${D2_HOME:-~/.d2}/tokens/$D2_AGENT.env.
#
# Prints the response body on stdout and "HTTP <status>" on stderr.
# Exit: 0 on 2xx, 1 on any other status, 2 usage, 3 no usable token, 4 network error.
# The token is never printed and never put on a command line.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

usage() { echo "usage: d2.sh METHOD /api/v2/path [body-file|-]" >&2; exit 2; }
[ $# -ge 2 ] && [ $# -le 3 ] || usage
method=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')
path=$2
body=${3:-}
case "$path" in /*) ;; *) usage ;; esac

agent=${D2_AGENT:-}
token=""
file=${D2_TOKEN_FILE:-}
if [ -z "$file" ] && [ -z "${D2_AGENT_TOKEN:-}" ] && [ -n "$agent" ]; then
  file="$(d2_home)/tokens/$agent.env"
fi
if [ -n "$file" ]; then
  d2_private "$file" || exit 3
  token=$(d2_read_var "$file" D2_AGENT_TOKEN) || true
  [ -n "$agent" ] || agent=$(d2_read_var "$file" D2_AGENT 2>/dev/null) || true
  # a bare token file has no D2_AGENT line; don't take the token as the name
  [ "$agent" != "$token" ] || agent=""
else
  token=${D2_AGENT_TOKEN:-}
fi
[ -n "$token" ] || { echo "d2.sh: no agent token (set D2_TOKEN_FILE or D2_AGENT_TOKEN; mint one with mint.sh)" >&2; exit 3; }
[ -n "$agent" ] || echo "d2.sh: warning: D2_AGENT is not set, sending no D2-Agent header" >&2

tmp=$(mktemp -d "${TMPDIR:-/tmp}/d2.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
d2_curl_cfg "$tmp/cfg" "$token" "$agent"
unset token

args=(-sS --max-time 60 -K "$tmp/cfg" -X "$method" -o "$tmp/out" -w '%{http_code}')
if [ -n "$body" ]; then
  if [ "$body" = "-" ]; then
    args+=(--data-binary @-)
  else
    [ -r "$body" ] || { echo "d2.sh: cannot read body file $body" >&2; exit 2; }
    args+=(--data-binary "@$body")
  fi
fi

code=$(curl "${args[@]}" "$(d2_base)$path") || { echo "d2.sh: network error calling $(d2_base)$path" >&2; exit 4; }
cat "$tmp/out"
echo "HTTP $code" >&2
case "$code" in 2??) exit 0 ;; *) exit 1 ;; esac
