#!/bin/bash
# check.sh - is this Linux box ready to run d2 agents with Claude Code? Checks only; installs nothing.
set -eu

missing=0
ok()   { printf '  ok       %s\n' "$1"; }
miss() { printf '  MISSING  %s\n' "$1"; missing=$((missing + 1)); }
info() { printf '  note     %s\n' "$1"; }

echo "Checking d2 agent prerequisites (Linux, Claude Code):"

if command -v node >/dev/null 2>&1; then
  v=$(node -v 2>/dev/null || echo v0)
  major=${v#v}; major=${major%%.*}
  case "$major" in ''|*[!0-9]*) major=0 ;; esac
  if [ "$major" -ge 24 ]; then ok "node $v"; else miss "node 24 or newer (found $v) - e.g. nvm install 24, or your distro's NodeSource package"; fi
else
  miss "node 24 or newer - e.g. nvm install 24, or your distro's NodeSource package"
fi

if command -v git >/dev/null 2>&1; then ok "git ($(git --version 2>/dev/null))"; else miss "git - e.g. sudo apt install git"; fi
if command -v curl >/dev/null 2>&1; then ok "curl"; else miss "curl - e.g. sudo apt install curl"; fi
if command -v python3 >/dev/null 2>&1; then ok "python3 (the scripts build JSON with it)"; else miss "python3 - e.g. sudo apt install python3"; fi
if command -v claude >/dev/null 2>&1; then ok "claude (Claude Code)"; else miss "claude (Claude Code) - install it from Anthropic"; fi

code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://aiputty.com/ 2>/dev/null || true)
if [ "$code" = 200 ]; then ok "https://aiputty.com answers"; else miss "https://aiputty.com does not answer (got ${code:-nothing}): check your network"; fi

[ -f .claude/settings.local.json ] || [ -f .claude/settings.json ] \
  || info "no .claude/settings.local.json here yet: cp clients/claude-code/linux/.claude/settings.json .claude/settings.local.json"
[ -n "${D2_URL:-}${D2_PROJECT:-}" ] || info "D2_PROJECT (or D2_URL) is not set: calls go to https://aiputty.com"

if [ "$missing" -eq 0 ]; then
  echo "All set."
else
  echo "$missing missing. Nothing was installed."
  exit 1
fi
