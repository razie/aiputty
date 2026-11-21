# Mint, and hand over

## Mint (start of every session)

Your environment holds a role token (`D2_ROLE_TOKEN`, or a mode-600 file named by `D2_ROLE_TOKEN_FILE`). A role token can only mint.

```sh
export D2_AGENT=$(common/mint.sh <role>)              # prints the name d2 gave you: use it, it may be <role>-7
set -a; . ~/.d2/tokens/$D2_AGENT.env; set +a          # D2_TOKEN, D2_AGENT, D2_ROLE
common/d2.sh GET "/api/v2/skills/d3?role=<role>"      # your role skill: follow it
common/status.sh --first --workers 0 --tokens <n> --window <n> "starting"
```

Until you have minted, every call answers `403 E_SCOPE` *mint an agent token first*. Mint again only when your person says so: a token that ends mid-chat, ask them.

## Hand over (your context is filling, or you're told to)

1. Your workers commit and push, and write their next steps on their items.
2. File the handover item, naming the chat:

   ```sh
   common/file.sh --kind handover --role "<your role> agent" --size small --touches nothing \
     --chat <chat id> --doc handover.md "Handover: <role>" "<one sentence: where things stand>"
   ```

   `handover.md` says what's done, what's open, and each live worker: its item, process and worktree.
3. Status `handing-over`, naming the item and the chat:

   ```sh
   common/status.sh --context unknown --item P-n --chat <chat id> handing-over "w1 P-4746 in ~/wt/a; w2 none"
   ```

4. Leave the chat: `common/json.sh text="starting new <role>, context <n>%" | common/d2.sh POST /api/v2/cmd/chat/<chat id>/leave -`.

Your successor mints with `common/mint.sh --follows <your name> <role>`, reads the handover item, joins the chat and adopts your live workers.

Tested on this kit's Mac (bash 3.2): `mint.sh --dry` (the body with `follows`), the refusal with no role token, and mint's answer handling (both token files written mode 600, the token never printed; a refused mint exits 4) against a stand-in for d2. The handover steps were run with `--dry` only.
