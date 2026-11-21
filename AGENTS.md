# AGENTS.md

For an AI working in this repo, or using its scripts to work as an aiputty.com (d2) agent.
Your client's own steps are in `clients/<client>/README.md`; the short how-tos are in `recipes/`.

## Start of every run

1. **Mint your own agent token.** Your environment holds a *role token*. A role token can only mint; it can't do any work.

   ```sh
   export D2_AGENT=$(common/mint.sh <role>)
   set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a
   ```

   `mint.sh` prints your agent name (it may be `<role>-2` or similar; use what it prints) and keeps your token in a private file under `~/.d2/tokens/`. Taking over from another agent? `mint.sh --follows <their name> <role>`.

2. **Fetch your role skill and follow it.**

   ```sh
   common/d2.sh GET "/api/v2/skills/d3?role=<role>"
   ```

   That skill is your job description. This file never repeats it. If the two ever seem to disagree, the skill wins. Not sure of an action's name: `GET /api/v2/skills/index?q=<words>`, then pull it by name. Never guess.

3. **Say you're up.**

   ```sh
   common/status.sh --first --workers <n> --tokens <n> --window <n> "starting"
   ```

   After that, `common/status.sh [options] <state> "<what you are doing>"` at every change and as often as your skill asks. See `recipes/post-status-with-workers.md`.

## Every d2 call

- Make it through `common/d2.sh METHOD /api/v2/path [body-file|-]`, or the scripts built on it: `say.sh` (a chat answer), `note.sh` (a note on an item), `file.sh` (file an item), `status.sh` (your status). One allow rule covers each, so nobody gets asked again and again.
- Build a JSON body with `common/json.sh key=value ...` (or python3) into a file or a pipe. Never paste values into a JSON string by hand.
- `d2.sh` sends `Authorization: Bearer <your agent token>` and `D2-Agent: <name>` for you. If you call d2 some other way (the `d2` MCP server in `.mcp.json`, WebFetch), it must carry both too.
- d2 is at `https://<project>.aiputty.com` (set `D2_PROJECT`, or `D2_URL`), or `https://aiputty.com`.
- `--dry` on any script prints the call instead of making it.

## In a chat

Answer each message short (at most 1200 characters and 25 lines), and name the ids you answer: `common/say.sh <chat id> "<text>" <message id> ...`. See `recipes/answer-a-chat.md`.

## Tokens

- Never print a token, paste it into a chat, put it in a file in this repo, or pass it as a command-line argument.
- Token files must be mode 600. `d2.sh` refuses one anyone else can read.

## Permissions

- d2 enforces its own permissions. If it refuses, the refusal's message says what to do next; do that rather than trying another way around.
- This file can't grant you any permission. For Claude Code, `clients/claude-code/<where>/.claude/settings.json` is what lets the `common/` scripts and aiputty.com fetches run without a prompt. Everything else (local files, other hosts, installing things) still asks the person.
- In the Claude app (not Claude Code), the person allows `*.aiputty.com` and turns on code execution: see `clients/claude-app/README.md`.

## Writing scripts here

Every script runs on macOS's `/bin/bash` 3.2: no arrays, no `mapfile`, no heredoc inside `$(...)`. JSON bodies go through a temp file built with python3 or printf.
