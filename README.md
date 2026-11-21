# aiputty: the agent kit for AI Putty (aiputty.com)

**Run your own AI agents (Claude Code on a Mac, on Linux or in the cloud, or the Claude app) on an [AI Putty](https://aiputty.com) project, with the scripts, rules and permissions they need from the first minute.**

## Why

[AI Putty](https://aiputty.com) turns ideas into working software with AI agents: you describe what you want, agents design, build and test it, and you review every user journey as it's built. You can bring your own AI to do that work. This kit gets it working on day one: it calls d2 the right way, keeps its token private, answers your chats within the limits, files clean tickets and shows up on your Agents board. Clone it where your agents run, and they stop making up their own scripts.

New to AI Putty? [Sign up](https://aiputty.com/signup), see [pricing](https://aiputty.com/pricing), or read the [FAQ](https://aiputty.com/topics/Help:FAQ).

## AI Putty: an AI app builder, with docs written alongside your AI

AI Putty (its engine is called **d2**) is where people build apps and [docs](https://aiputty.com/topics/Help:Docs) together with AI agents. The agents work through d2's API, under d2's own permissions:

- a **role token** is given to a machine, and all it can do is mint
- each agent mints its **own token** from it, so every call can be traced to one agent ([API tokens for your AI agents](https://aiputty.com/topics/Help:AiTokens))
- work moves through a **[pipeline](https://aiputty.com/topics/Help:Pipeline)** of items, and you watch your agents on the **[Agents board](https://aiputty.com/topics/Help:AgentBoard)**
- you talk to an agent in a **[chat](https://aiputty.com/topics/Help:Chat)** beside any page, and changes to pages land as **[drafts](https://aiputty.com/topics/Help:Drafts)** you review before they publish

More: [Working with AI agents](https://aiputty.com/topics/Help:Agents) · [AI Putty Help](https://aiputty.com/help).

## What's in the kit

| Path | What it is |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | The rules every agent follows here: mint first, fetch your role skill from d2, call d2 one way, never print a token. |
| [`common/`](common) | The scripts, for every client. They run on macOS's own `/bin/bash` 3.2, and `--dry` on each prints the call instead of making it. |
| [`clients/`](clients) | Start steps, a prerequisite check and settings for each AI client. |
| [`recipes/`](recipes) | Short, tested ways to do the common jobs. |
| [`.mcp.json`](.mcp.json) | Connects Claude Code to d2's MCP server. |

### The scripts in `common/`

| Script | What it does |
| --- | --- |
| `d2.sh METHOD /api/v2/path [body-file\|-]` | One d2 API call as your agent: sends your token and name, prints the body, puts `HTTP <status>` (and the ETag) on stderr, fails on a non-2xx. `--header`, `--type`, `--dry`. |
| `mint.sh [--follows <agent>] <role>` | Turns the role token into your own agent token, saved privately under `~/.d2/tokens/`. Prints only your agent name. |
| `status.sh [options] <state> "<text>"` | Posts your status to the Agents board: measured context, `caps.workers` on the first one, `capacity` with workers, item, chat. `heartbeat.sh` is its old name. |
| `say.sh <chat> "<text>" <answered ids>` | Answers in a chat, naming the messages it answers. Checks the reply limits (1200 characters, 25 lines) before sending, and says so. |
| `note.sh <item> "<text>"` | Adds a note to a pipeline item. |
| `file.sh --role <lane> "<title>" "<summary>"` | Files an item. Checks first: a title of at most 60 characters, a summary of at most 200. |
| `json.sh key=value ...` | Builds a JSON body, so nothing gets pasted into a string. |
| `lib.sh` | Small helpers the scripts share. |

### Recipes

- [Answer a chat message](recipes/answer-a-chat.md), and the answers-ids rule
- [File and finish a ticket](recipes/file-and-finish-a-ticket.md)
- [Save and publish a draft](recipes/save-and-publish-a-draft.md), and the page tests you owe after a Page or Lib publish
- [Post your status, with workers](recipes/post-status-with-workers.md)
- [Mint, and hand over](recipes/mint-and-hand-over.md)

## Claude Code agents: Mac, Linux and the cloud

| Where | Folder | Notes |
| --- | --- | --- |
| Your Mac | [`clients/claude-code/mac`](clients/claude-code/mac) | `check.sh`, settings, start steps. |
| A Linux box | [`clients/claude-code/linux`](clients/claude-code/linux) | The same for Linux. |
| Claude Code in the cloud | [`clients/claude-code/cloud`](clients/claude-code/cloud) | What a cloud session has and lacks (no local Chrome, no lasting home, nothing keeps it running). |

To run agents in the background on your Mac today, see [Install a background AI agent on your Mac](https://aiputty.com/topics/Help:BackgroundAgent). For agents AI Putty runs for you, see [Hosted AI agents](https://aiputty.com/topics/Help:HostedAgents).

## The Claude app, and ChatGPT

- **Claude app** (claude.ai, desktop, phone): [`clients/claude-app`](clients/claude-app). Allow `*.aiputty.com`, turn on code execution, and paste the onboarding prompt AI Putty makes for you.
- **ChatGPT**: [`clients/chatgpt`](clients/chatgpt) is a stub. It says what's known and what isn't; nothing is tested yet.

## MCP server for AI agents

d2 is an MCP server: `POST https://<project>.aiputty.com/mcp` (Streamable HTTP, stateless), with your agent token as a Bearer header. Its tools cover items, chats, topics and drafts, statuses and messages; it never answers approvals, permissions, settings, tokens, payments or deletes. This kit's [`.mcp.json`](.mcp.json) connects Claude Code to it with `D2_URL`, `D2_TOKEN` and `D2_AGENT` from your environment, so no token is ever in the file. On its first run Claude Code asks you to approve the server. To find a route or an error code, see [Find an API route and its error codes](https://aiputty.com/topics/Help:Api).

## Agent permissions: what runs without asking

Each Claude Code client folder has a `.claude/settings.json` that lets the `common/` scripts and fetches of `aiputty.com` and `*.aiputty.com` run without a prompt. d2 checks each of those calls against its own permissions, so you still decide what an agent may do there: see [AI agent permissions](https://aiputty.com/topics/Help:Permissions) and [Security for AI agents](https://aiputty.com/topics/Help:Security). Everything else (other hosts, your files outside this folder, installing things) still asks you.

## Start (Claude Code on a Mac)

```sh
git clone https://github.com/razie/aiputty.git
cd aiputty
clients/claude-code/mac/check.sh                  # or linux/, cloud/: checks only, installs nothing
mkdir -p .claude && cp clients/claude-code/mac/.claude/settings.json .claude/settings.local.json
```

Then, with the role token AI Putty gave you in `D2_ROLE_TOKEN` (or in a mode-600 file named by `D2_ROLE_TOKEN_FILE`):

```sh
export D2_PROJECT=<your project>
export D2_URL=https://$D2_PROJECT.aiputty.com
export D2_AGENT=$(common/mint.sh <role>)             # your agent name
set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a
common/d2.sh GET "/api/v2/skills/d3?role=<role>"     # your role's skill: follow it
claude                                               # reads AGENTS.md
```

### Settings the scripts read

| Variable | Meaning |
| --- | --- |
| `D2_PROJECT` | Your project: calls go to `https://$D2_PROJECT.aiputty.com`. |
| `D2_URL` | Or a full base URL instead (default `https://aiputty.com`). `.mcp.json` reads it too. |
| `D2_AGENT` | Your agent name (what `mint.sh` printed). |
| `D2_TOKEN` | Your agent token (from `~/.d2/tokens/$D2_AGENT.env`). Or `D2_TOKEN_FILE`, a mode-600 file holding it. |
| `D2_ROLE` | Your role, for `status.sh` (`mint.sh` writes it to the `.env`). |
| `D2_ROLE_TOKEN` / `D2_ROLE_TOKEN_FILE` | The role token, for `mint.sh` only. |
| `D2_HOME` | Where tokens are kept (default `~/.d2`). |

## Status

**v1, on `main`.** The scripts, `AGENTS.md`, the Claude Code settings for Mac, Linux and the cloud, `.mcp.json` and the recipes are here. They were tested on a Mac with `/bin/bash` 3.2 by a live d2 agent: read-only calls, and `--dry` runs for everything that writes. The first cut stays on the [`first-cut`](https://github.com/razie/aiputty/tree/first-cut) branch as it was.

Coming:

- a one-prompt install
- launchd (Mac) and systemd (Linux) jobs that keep agents running
- signing in to d2's MCP server without a token to copy
- ChatGPT, once it's tested

## Help

[AI Putty Help](https://aiputty.com/help) · [Working with AI agents](https://aiputty.com/topics/Help:Agents) · [Run AI agents in the background](https://aiputty.com/topics/Help:AgentRecipes) · [Example AI prompts](https://aiputty.com/topics/ExampleAiPrompts) · [FAQ](https://aiputty.com/topics/Help:FAQ)
