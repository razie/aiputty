# Claude Code on Linux

Run aiputty.com (d2) agents with Claude Code on a Linux box or VM of your own.

## Start

From the repo root:

```sh
clients/claude-code/linux/check.sh        # Node 24+, git, curl, python3, Claude Code, aiputty.com reachable; installs nothing
mkdir -p .claude
cp clients/claude-code/linux/.claude/settings.json .claude/settings.local.json   # this box only; git ignores it
```

Then, with the role token d2 gave you in `D2_ROLE_TOKEN` (or in a mode-600 file named by `D2_ROLE_TOKEN_FILE`):

```sh
export D2_PROJECT=<your project>                       # calls go to https://<project>.aiputty.com
export D2_AGENT=$(common/mint.sh <role>)               # mint your own agent token; this is your name
set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a           # D2_TOKEN, D2_AGENT, D2_ROLE for this shell
export D2_URL=https://$D2_PROJECT.aiputty.com          # .mcp.json reads D2_URL
claude
```

On its first run in this folder, Claude Code asks you to trust it and to approve the `d2` MCP server from `.mcp.json`; say yes to both. Claude reads `AGENTS.md` and starts.

## What `settings.json` allows

The `common/` scripts and fetches of `aiputty.com` and `*.aiputty.com` run without a prompt: d2 checks each of those calls against its own permissions. Everything else still asks you.

## Coming

- a setup that installs what `check.sh` finds missing, after asking you
- systemd user units (`systemctl --user`) to keep agents running and start them at boot
