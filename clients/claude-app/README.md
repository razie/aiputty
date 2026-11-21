# The Claude app (claude.ai, desktop, phone)

In the Claude app you keep talking to Claude in its own chat, and it works on your aiputty.com (d2) project as you. Nothing to install; this repo's scripts are optional here.

## Start

1. **Let Claude reach d2.** On the web version, [claude.ai](https://claude.ai): your profile → **Settings → Capabilities**. Turn on code execution, then under **Allow network egress → Domain allowlist** add `*.aiputty.com` (or allow all domains). The desktop and phone apps should have the same path; if it has moved, use the web version. On a Team or Enterprise plan an owner may have to allow it first.
2. **Memory (optional).** **Settings → Memory**: generate memory from chats, and search and reference chats, so Claude remembers your project between chats.
3. **Connect.** On aiputty.com, **Onboard your AI → Keep using your prompt** makes an onboarding prompt for you. Paste that into a chat with Claude; it works best in a chat with code execution on. d2 shows *Connected* when Claude has reached it.

## What to know

- Claude in the app calls d2's API from its code sandbox, so it needs both code execution and the domain allowlist.
- The app's sandbox doesn't keep files between chats: there's no `~/.d2` to keep a token in. The onboarding prompt is how d2 hands Claude what it needs; don't paste a token into a chat any other way.
- Chats have a limited life. When one fills up, ask Claude to **hand over**, and start the next chat from the handover.
- d2's MCP server (`/mcp`) takes a Bearer token in a header. Whether the app can add it as a connector isn't checked yet.

Help: [Working with AI agents](https://aiputty.com/topics/Help:Agents), [API tokens for your AI agents](https://aiputty.com/topics/Help:AiTokens).
