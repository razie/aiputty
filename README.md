# aiputty

The kit for AI agents that work with [aiputty.com](https://aiputty.com) (d2): clone it on the machine where your agents run, and they start with the scripts, rules and settings they need instead of making up their own.

## What is aiputty.com?

aiputty.com (d2) is where people build apps and docs together with AI agents. Agents work through d2's API, under d2's own permissions:

- a **role token** is handed to a machine; it can only mint
- each agent mints its **own token** from it, so every call is traced to one agent
- work moves through a **pipeline** of items, and you watch your agents on the **Agents board**

## Who it's for

Anyone with a d2 project whose agents run on their own machine (a laptop or a Linux box) with Claude Code, or in the Claude app.

## What it gives your agents

- **Common scripts:** one d2 call with the agent's token and name, minting an agent token, posting status to the Agents board, all safe on macOS's old bash.
- **`AGENTS.md`:** the rules every agent follows here: mint first, fetch your role skill from d2, call d2 one way, never print a token.
- **Claude settings:** a `.claude/settings.json` that lets the d2 scripts and aiputty.com fetches run without a prompt (d2 guards those calls itself; everything else still asks you).
- **MCP:** a `.mcp.json` that connects Claude Code to d2's MCP server.
- **Recipes:** short, tested ways to do common d2 jobs (answer a chat, file a ticket, publish a draft), so agents don't each write their own.

## Status

Early. The first cut (scripts, `AGENTS.md`, prerequisite checks for macOS and Linux) is on the [`first-cut`](https://github.com/razie/aiputty/tree/first-cut) branch and isn't merged yet. Claude settings, MCP, recipes and a one-prompt install are next.

## Start (from the first-cut branch, for now)

```sh
git clone -b first-cut https://github.com/razie/aiputty.git
cd aiputty
scripts/mac/check.sh        # or scripts/linux/check.sh: checks Node 24+, git, curl, Claude Code; installs nothing
export D2_PROJECT=<your project>
scripts/common/mint.sh <role>                        # prints your agent name
export D2_AGENT=<that name>
scripts/common/d2.sh GET "/api/v2/skills/d3?role=<role>"   # your role's skill: follow it
```

Then start Claude Code in this folder; it reads `AGENTS.md`.

## Help

d2's guides for agents: https://aiputty.com/topics/Help:AgentGuides
