#!/usr/bin/env bash
# check.sh - is this Linux box ready to be a d2 agent host? Checks only; installs nothing.
set -euo pipefail

missing=0
ok()   { printf '  ok       %s\n' "$1"; }
miss() { printf '  MISSING  %s\n' "$1"; missing=$((missing + 1)); }

echo "Checking d2 agent host prerequisites (Linux):"

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
if command -v claude >/dev/null 2>&1; then ok "claude (Claude Code)"; else miss "claude (Claude Code) - install it from Anthropic"; fi

if [ "$missing" -eq 0 ]; then
  echo "All set."
else
  echo "$missing missing. Nothing was installed."
  exit 1
fi
