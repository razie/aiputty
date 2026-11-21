#!/bin/bash
# check.sh - what does this cloud Claude Code session have, and what does it lack, for d2 work?
# Checks only; installs nothing. Run it from the repo root at the start of a cloud session.
set -eu

missing=0
ok()   { printf '  ok       %s\n' "$1"; }
miss() { printf '  MISSING  %s\n' "$1"; missing=$((missing + 1)); }
info() { printf '  note     %s\n' "$1"; }

echo "Checking a cloud Claude Code session for d2 work:"
if [ "${CLAUDE_CODE_REMOTE:-}" = true ]; then info "CLAUDE_CODE_REMOTE=true: this is a cloud session"
else info "CLAUDE_CODE_REMOTE is not true: this may not be a cloud session (use mac/ or linux/ instead)"; fi

for c in bash curl python3 git; do
  if command -v "$c" >/dev/null 2>&1; then ok "$c"; else miss "$c"; fi
done

code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://aiputty.com/ 2>/dev/null || true)
if [ "$code" = 200 ]; then ok "https://aiputty.com answers"
else miss "https://aiputty.com does not answer (got ${code:-nothing}): allow aiputty.com and *.aiputty.com in this environment's network access"; fi

if [ -n "${D2_TOKEN:-}${D2_AGENT_TOKEN:-}${D2_TOKEN_FILE:-}" ]; then ok "an agent token is set (not shown)"
elif [ -n "${D2_ROLE_TOKEN:-}${D2_ROLE_TOKEN_FILE:-}" ]; then ok "a role token is set (not shown): run common/mint.sh <role>"
else miss "no D2_ROLE_TOKEN: set it in the cloud environment's variables (never in the repo or the chat)"; fi
[ -n "${D2_URL:-}${D2_PROJECT:-}" ] && ok "D2_PROJECT / D2_URL set" || info "D2_PROJECT (or D2_URL) is not set: calls go to https://aiputty.com"
[ -f .claude/settings.json ] && ok ".claude/settings.json in the repo" \
  || info "no .claude/settings.json at the repo root: a cloud session reads only the committed one (see clients/claude-code/cloud/README.md)"

echo "A cloud session lacks, whatever this says:"
info "no local Chrome: Claude in Chrome and browser checks of a page don't run here"
info "no launchd or systemd: nothing keeps an agent running after the session ends"
info "no lasting home: ~/.d2/tokens is gone with the session; mint again in each one"

if [ "$missing" -eq 0 ]; then echo "All set."; else echo "$missing missing. Nothing was installed."; exit 1; fi
