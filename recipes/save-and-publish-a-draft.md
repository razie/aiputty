# Save and publish a draft

Topics (pages, docs, help, styles) change through drafts: you save a draft, then publish it when the permission lets you.

## Read, edit, save

```sh
common/d2.sh GET /api/v2/drafts/Page:Chat > page.md      # your open draft, if any: stderr says HTTP 200 ETag "d<n>"
common/d2.sh GET /api/v2/topics/Page:Chat > page.md      # no draft yet (404 above): the published text and its ETag
# ... edit page.md: the whole text, changed only where you mean to ...
common/d2.sh --type text/markdown --header 'If-Match: <the ETag, quotes and all>' \
  PUT "/api/v2/drafts/Page:Chat?why=keep+focus+in+the+reply+box" page.md
```

- `GET /api/v2/drafts/<topic>` answers JSON (its `text` is the draft); `GET /api/v2/topics/<topic>` answers the raw markdown. Save raw markdown, never the JSON.
- Every save says **why** (`?why=` or a `D2-Why` header): what changed and whose word. An AI's save without one is refused or warned.
- The answer has the new `dver`. Chain the next save on it (`If-Match: "d<dver>"`) with no re-read.
- `409 E_DRAFT_CHANGED`: someone else saved meanwhile. Read again and merge; never overwrite.

## Publish

```sh
common/d2.sh POST /api/v2/cmd/Draft/Page:Chat/publish
```

Whether you may depends on the project's permission for you: *free* publish; *tells* publish, and your person gets a notice; *asks* publish only on their word (send `{"askedBy": "<person>"}`), else it waits as an approval; *person* leave it, they publish it from Drafts. A refusal (`E_SCOPE`) says what to do next.

## After a Page or Lib publish: the page tests you owe

A `Page:` or `Lib:` (or `Style:`) the release's page tests cover should be published with a passing test stamp of exactly the draft you publish. Without one it still publishes, with `W_PAGE_UNTESTED`, and **you owe its tests**:

- the publish answers `owed {tests, run, due}`; due is 5 minutes on, and every answer carries `W_TESTS_OWED` until you pay;
- pay by running the named tests and stamping the result: `POST /api/v2/drafts/<topic>/stamp {hash, tests, passed, commit?}` (hash: the sha256 of the text tested; with no draft left, the published text's);
- past 5 minutes, your next publish is refused `409 E_TESTS_OWED` until you've paid;
- a Lib's tests are its own plus those of the covered pages that load it;
- a change of only a one-line `title:` or `description:` owes nothing.

When the ticket that made the change is a bug touching the page, its close names a `ui:` test (see [file and finish a ticket](file-and-finish-a-ticket.md)).

Tested on this kit's Mac (bash 3.2), read-only: a topic read and a draft read with their ETags through `d2.sh`, and a quoted `If-None-Match` header through `--header` (answered `304`). No draft was saved or published.
