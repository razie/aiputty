# host/: the d2 agent host (slice 1: the core)

A small Node 24 program, no packages, that keeps d2 agents answering on a Mac: one loop per **seat**.
Design: DesignMacHost on d2spec (sections 2, 3, 6, 10, 12). This slice is the core only; `d2-host init`,
`install` (launchd), `update` and `uninstall` come in slice 2.

## What it does

For each seat (today: one designer), forever:

1. Read the seat agent's `GET /api/v2/agents/next` with its own token (a 10 s long-poll). d2 orders what waits.
2. Something waits: start one `claude -p` on stream-json (or resume the seat's last session) and write each
   entry to its stdin as one line, `[<id>] <kind> from <who> in chat <chat>: <text>`. A fresh session gets
   d2's own start prompt first (`GET /api/v2/skills/start?role=<role>&kind=pass,minted`); the host has no prompt
   text of its own. Entries that arrive while the pass runs go into the same pass.
3. Nothing left (next is empty, or the agent's turn ended with nothing new): close stdin; the pass ends.
4. A status every 60 s (`up` at start, then `working` or `idle`), with the context measured from the stream.

- **No cursors:** an entry the agent didn't answer comes again from d2 on the next read.
- **No text decides anything:** "bye", "handover", "stop" in a chat are handed to the agent like any words.
- **Silence:** a pass with no output for 10 minutes is killed. **Failures:** three failed passes in a row
  back off 10 minutes, with one line to the person's chat (`POST /api/v2/agents/alert`).
- **A killed host** (`kill -9`) leaves its pass running; the next host waits for that pass to end before it
  reads next, so a message is never answered twice.
- **Revoked token** (401/403): the seat stops and says so in its log.
- **Tokens** stay in their mode-600 files and the host's memory: sent only as a request header, never on a
  command line, never logged (every log line is scrubbed). The agent gets the token file's *path*
  (`D2_TOKEN_FILE`, as `common/d2.sh` reads it), never the value in its environment: the host drops the
  D2_ token vars and any other var holding a token (a role token the person exported) from the agent's env.
  A log line that can't be written is lost; it never stops the host.
- Agents run as on the person's own Mac: `--permission-mode acceptEdits` with Bash, Read, Edit, Write
  (DesignMacHost section 6: this is not a fence).

## Run it by hand

```sh
mkdir -p ~/.d2/tokens ~/.d2/host && chmod 700 ~/.d2 ~/.d2/tokens
# a token file for the seat's agent, mode 600 (KEY=value lines, as common/mint.sh writes them):
#   D2_AGENT=<agent name>
#   D2_TOKEN=<that agent's token>
chmod 600 ~/.d2/tokens/<agent>.env
cat > ~/.d2/host/host.json <<'EOF'
{
  "project": "<your project>",
  "startedBy": "<you>",
  "seats": [ { "role": "designer", "tokenFile": "~/.d2/tokens/<agent>.env" } ]
}
EOF
node host/loop.js            # or: node host/loop.js --config <file>
```

Optional keys: `url` (instead of `https://<project>.aiputty.com`), `claude` (the command, a path or an array
of command and arguments), `home` (default `~/.d2`), a seat's `work` folder (default
`~/.d2/work/<project>/<role>`) and `agent` (default: the token file's `D2_AGENT`).

Logs: `~/.d2/host/logs/<agent>.log` and `<agent>.stream.jsonl` (the stream, scrubbed); pass state in
`~/.d2/host/state/`. Stop with Ctrl-C or `kill <pid>`: the running pass stops too.

## Tests

```sh
node --test host/
```

A fake d2 (`testkit/fake-d2.js`) and a stand-in agent (`testkit/stubagent.js`, not named like Claude) cover:
one answer per message, entries handed mid-pass, `kill -9` mid-pass answered once, chat words that change
nothing, a silent stream killed, three failures backing off, a refused token, no token in `ps` or the logs.
The tests leave no process running.
