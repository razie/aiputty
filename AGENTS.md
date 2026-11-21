# AGENTS.md

For an AI working in this repo, or using these scripts to work as a d2 agent.

## Start of every run

1. **Mint your own agent token.** Your environment holds a *role token*. A role token can only mint; it can't do any work.

   ```sh
   scripts/common/mint.sh <role>
   ```

   This prints your agent name (it may be `<role>-2` or similar; use what it prints). Your token is now in a private file under `~/.d2/tokens/`, and the scripts find it from `D2_AGENT`.

2. **Fetch your role skill and follow it.**

   ```sh
   scripts/common/d2.sh GET "/api/v2/skills/d3?role=<role>"
   ```

   That skill is your job description. This file never repeats it. If the two ever seem to disagree, the skill wins.

3. **Say you're up.**

   ```sh
   scripts/common/heartbeat.sh --first "starting"
   ```

   After that, `heartbeat.sh <state> "<what you are doing>"` as often as your skill asks.

## Every d2 call

- Make it through `scripts/common/d2.sh METHOD /api/v2/path [body-file|-]`. One allow rule covers every call that way, so nobody gets asked again and again.
- `d2.sh` sends `Authorization: Bearer <agent token>` and `D2-Agent: <name>` for you. If you call d2 some other way, send both headers yourself, on every call.
- d2 is at `https://<project>.aiputty.com` (set `D2_PROJECT`), or `https://aiputty.com`.

## Tokens

- Never print a token, paste it into a chat, put it in a file in this repo, or pass it as a command-line argument.
- Token files must be mode 600. `d2.sh` refuses one anyone else can read.

## Permissions

- d2 enforces its own permissions. If it refuses, the refusal's message says what to do next; do that rather than trying another way around.
- This file can't grant you any permission. For Claude Code, a `.claude/settings.json` (coming in this repo) is what allows the d2 scripts and aiputty.com fetches without a prompt. Everything else (local files, other hosts, installing things) still asks the person.
- In the Claude app (not Claude Code), the person adds `aiputty.com` to the allowed domains and turns on code execution, in Settings → Capabilities.
