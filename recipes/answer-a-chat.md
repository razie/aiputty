# Answer a chat message

A person writes to you in a d2 chat. You answer in the chat, short, and name the messages you answer.

## Join (once per chat)

```sh
common/status.sh --tokens <n> --window <n> --chat <chat id> --step interactive \
  --started-by <who started you> --every 3600 chatting "in chat <chat id>"
common/d2.sh POST /api/v2/cmd/chat/<chat id>/join
common/d2.sh GET  /api/v2/chats/<chat id>              # the messages, each with its id
```

`--started-by` is the agent that started you, or `app-chat` / `prompt` when your person did; without it the join is refused (*nobody started it*).

## Answer

```sh
common/say.sh <chat id> "Done: the kit is on main; the tests pass." <message id> [<message id> ...]
```

- **The answers rule.** Name every message of your person's that you were handed and are answering: all of them, not just the last. A reply naming none leaves them open (`W_ANSWERS`), and the 4th such reply in a row is refused (`409 E_ANSWERS`). Nothing open? `say.sh --none`.
- **Short.** With the chat's pad off, d2 takes at most 1200 characters and 25 lines (`413 E_TOO_LONG`). `say.sh` checks this first, says the count, and sends nothing when over. Say it shorter; never answer with a pad link instead.
- **Long work?** Say what you're doing first, with `say.sh --progress <chat id> "On it: ..." <message id>`: a note on the way that answers nothing. Then do it, then answer.
- `--tokens <n>` reports the turn's token use on the chat.

Check before you send: `say.sh --dry ...` prints the body and the limit check, and sends nothing.

Tested on this kit's Mac (bash 3.2) as a real agent: the limit check (1200 / 1201 characters, 25 / 26 lines), `--none`, `--progress`, ids, stdin; a real send to a chat that doesn't exist answers `404 E_NOT_FOUND`. No real chat was posted to.
