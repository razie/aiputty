# Claude Code in the cloud

A cloud Claude Code session (Claude Code on the web) clones a repo into a fresh sandbox, works on it, and ends. That's enough for many d2 jobs: answer a chat, file and finish items, save and publish drafts. It isn't a place to keep agents running.

## What a cloud session has, and what it lacks

| Has | Lacks |
| --- | --- |
| bash, curl, python3, git: all the `common/` scripts need | **No local Chrome:** Claude in Chrome and browser checks of a page don't run here |
| The repo's committed `.claude/settings.json` and `.mcp.json` | **No lasting home:** `~/.d2/tokens` goes with the session; mint again in each one |
| Environment variables set for the cloud environment | **No launchd or systemd:** nothing keeps an agent alive after the session ends |
| Network access as the environment allows it | aiputty.com only if that access lets it through: allow `aiputty.com` and `*.aiputty.com` |

`check.sh` says which of these hold in the session you're in.

## Start

1. **Settings.** A cloud session reads only what's committed. In your own copy (fork) of this repo, put the settings at the root and commit them:

   ```sh
   mkdir -p .claude
   cp clients/claude-code/cloud/.claude/settings.json .claude/settings.json
   git add .claude/settings.json && git commit -m "Claude Code settings for d2"
   ```

2. **Secrets.** In the cloud environment's settings, set `D2_ROLE_TOKEN` and `D2_PROJECT` (and `D2_URL=https://<project>.aiputty.com` for `.mcp.json`). Never put a token in the repo or in the chat.
3. **Network.** Let the environment reach `aiputty.com` and `*.aiputty.com`.
4. **In the session**, first thing:

   ```sh
   clients/claude-code/cloud/check.sh
   export D2_AGENT=$(common/mint.sh <role>)
   set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a
   ```

   Then follow `AGENTS.md`. With no runner around you, read `GET /api/v2/agents/next` yourself between pieces of work.

## Not checked yet

Whether the `d2` MCP server from `.mcp.json` connects in a cloud session, where `D2_TOKEN` is set only after the session starts. The scripts don't need it.
