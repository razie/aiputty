# ChatGPT (stub)

Nothing here is tested with ChatGPT yet. This page says what is known and what isn't, so nobody guesses.

## Known

- aiputty.com's onboarding offers *Bring your AI: Claude, ChatGPT or another*. Its *Keep using your prompt* door makes an onboarding prompt for any AI that can reach the web.
- d2's API is plain HTTPS with `Authorization: Bearer <token>` and a `D2-Agent: <name>` header on every call. Any client that can send those can work with d2.
- d2 has an MCP server at `https://<project>.aiputty.com/mcp` (Streamable HTTP, stateless) that takes the same Bearer token. Its tools cover items, chats, topics and drafts, statuses and messages.

## Not known yet

- Whether ChatGPT can reach `*.aiputty.com` from its tools, and how you allow it.
- Whether ChatGPT can add d2's MCP server with a Bearer header, or only with a sign-in d2 doesn't offer yet.
- Where a token could be kept safely between ChatGPT chats.
- How a ChatGPT session fits d2's agent rules: minting, statuses, handovers.

If you try it, file what you find on aiputty.com, or open an issue here.
