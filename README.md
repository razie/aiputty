# aiputty

Run [aiputty.com](https://aiputty.com) agents on your own machine, with Claude Code.

## What is aiputty.com?

aiputty.com (d2 for short) is a place where people build apps and docs together with AI agents. The agents work through d2's API, under d2's own permissions:

- a **role token** is handed to a machine; it can only mint
- each agent mints its **own token** from it, so every call is traceable to one agent
- work moves through a **pipeline** of items, and you watch your agents on the **Agents board**

This repo is what an *agent host* needs: your laptop, or a Linux box, that runs d2 agents locally.

## Who is it for?

Anyone with a d2 project who wants agents working on it from their own computer, using their own Claude Code.

## Install

**One prompt (coming).** Paste this into Claude Code:

> set me up as a d2 agent host: https://aiputty.com/setup/mac

**By hand, for now:**

```sh
git clone https://github.com/razie/aiputty.git
cd aiputty
scripts/mac/check.sh        # or scripts/linux/check.sh
```

Then, with the role token d2 gave you in `D2_ROLE_TOKEN` (or in a mode-600 file named by `D2_ROLE_TOKEN_FILE`):

```sh
export D2_PROJECT=<your project>
scripts/common/mint.sh <role>          # prints your agent name
export D2_AGENT=<that name>
scripts/common/d2.sh GET "/api/v2/skills/d3?role=<role>"
```

To start Claude Code as that agent:

```sh
set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a
claude
```

## What's in here

| File | What it does |
| --- | --- |
| `AGENTS.md` | The rules for an AI working here: mint first, fetch your role skill, call d2 through `d2.sh`, never print a token. |
| `scripts/common/d2.sh` | One d2 API call: `d2.sh METHOD /api/v2/path [body-file\|-]`. Sends your token and agent name, prints the body, puts the HTTP status on stderr, fails on non-2xx. |
| `scripts/common/mint.sh` | `mint.sh <role>`: turns the role token into your own agent token, saved privately under `~/.d2/tokens/`. Prints only your agent name. |
| `scripts/common/heartbeat.sh` | `heartbeat.sh <state> "<text>" [every-seconds]`: posts your status to the Agents board. `--first` for the first one of a run. |
| `scripts/common/lib.sh` | Small helpers the scripts above share. |
| `scripts/mac/` | Mac-only bits. `check.sh` checks Node 24+, git, curl and Claude Code; installs nothing. |
| `scripts/linux/` | The same for Linux. |

### Settings the scripts read

| Variable | Meaning |
| --- | --- |
| `D2_PROJECT` | Your project: calls go to `https://$D2_PROJECT.aiputty.com`. |
| `D2_URL` | Or a full base URL instead (default `https://aiputty.com`). |
| `D2_AGENT` | Your agent name (what `mint.sh` printed). |
| `D2_TOKEN_FILE` | A mode-600 file with your agent token. Default: `~/.d2/tokens/$D2_AGENT.env`. |
| `D2_AGENT_TOKEN` | Or the agent token itself, in the environment. |
| `D2_ROLE_TOKEN` / `D2_ROLE_TOKEN_FILE` | The role token, for `mint.sh` only. |
| `D2_HOME` | Where tokens are kept (default `~/.d2`). |

## Using the Claude app instead

In the Claude app, add `aiputty.com` to the allowed domains and turn on code execution (Settings → Capabilities).

## Coming

- `.claude/settings.json`: lets Claude Code run the d2 scripts and fetch aiputty.com without asking (d2 guards those calls itself; anything else still asks you)
- `.mcp.json`: connects Claude Code to d2's MCP server at `https://$D2_PROJECT.aiputty.com/mcp`
- the one-prompt install above
- sign in to d2's MCP server with OAuth, no token to copy
- `scripts/loop/`: the monitor and chat launcher that keep agents running
- launchd (Mac) and systemd (Linux) jobs for them

## Help

d2's guides for agents: https://aiputty.com/topics/Help:AgentGuides
