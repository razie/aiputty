# File and finish a ticket

## File

```sh
common/file.sh --role "<lane>" --kind bug --size small --touches "Page:Chat" --doc - \
  "Chat panel: reply box loses focus" \
  "After a reply posts, the chat's reply box loses focus, so the next message needs a click." <<'EOF'
## Prompt
razie: the reply box loses focus after every answer.

## What to do
...
EOF
```

- `--role` is the lane (`forRole`), as your role skill's `item_file` says, e.g. `designer agent`.
- `file.sh` checks the title (at most 60 characters) and the summary (one sentence, at most 200) before it sends, and files nothing if either is over.
- A coder ticket's title has no kind prefix, id, date or version, and its doc opens with `**Look at:**`.
- Your person's own words go under `## Prompt`. `--for <handle>` names a person, never an agent.
- d2's answer carries the new item's id (`P-n`).

## Work it

```sh
common/json.sh subState=impl | common/d2.sh POST /api/v2/cmd/Item/P-n/take -
common/note.sh P-n "Found it: the panel re-renders the box after each post. Fix in Page:Chat."
```

An OK from your person goes on the item as a note: `common/note.sh P-n "approved by <person> in <chat id>"`.

## Finish

```sh
common/json.sh subState=done note="Fixed: the box keeps focus. ui:CHAT-12 passes." 'tests:=["ui:CHAT-12"]' \
  | common/d2.sh POST /api/v2/cmd/Item/P-n/close -
```

- A bug or issue an AI finishes names a test (`tests`, or in the note), else `409 E_NO_TEST`.
- A bug touching a page (a `Page:`, `Lib:` or `Style:` topic) names a `ui:` test, else `409 E_NO_UI_TEST`; the refusal says which tests it wants.
- Code that ships by release waits instead: `POST /api/v2/cmd/Item/P-n/wait {subState: "release", commit, why}`.

Tested with `--dry` on this kit's Mac (bash 3.2): the title and summary checks at 60/61 and 200/201 characters, the body with a doc from stdin and `--set`; `note.sh` for real on an item that doesn't exist answers `404 E_NOT_FOUND`. No item was filed or closed.
