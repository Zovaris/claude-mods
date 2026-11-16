# cache-control

A prompt-cache meter for Claude Code: what each request read from the cache, what a cold send would cost, a confirmation before an expensive one, and a keep-warm ping.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install cache-control@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

## The row above the prompt

A slim bar of what the last request read, wrote and sent new; the hit rate; a state; the time left; and what a cold send would cost now.

| State | Meaning |
| --- | --- |
| warm | the cache is alive and was read |
| expiring | close to expiring: the last 5 minutes of a 1-hour cache, the last minute of a 5-minute one |
| missed | the last request rewrote what it should have read |
| cold | the cache has expired; the next send pays full price |
| compacted | the conversation was just compacted |
| not cached | nothing was cached |
| no requests | nothing sent yet this session |

## The pane

`/cache`, or **Details** on the row: time left, context size, hit rate, the cost of a cold send, what the cache saved, the last request, and a table of turns.

## Features

- **Confirm cold sends.** With the cache expired and a context of 50k tokens or more, it asks before your message goes out, with the cost. `/cache guard off` turns it off.
- **Keep warm.** `/cache warm 2h` pings the cache shortly before it expires while you're idle (10 minutes before for a 1-hour cache, 1 minute for a 5-minute one). It stops by itself if the cache had already gone cold. `/cache warm off` stops it.
- **Cache lifetime.** Follows Claude Code's own rules (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `promptCacheTtl`, `ENABLE_PROMPT_CACHING_1H`, then the account) and corrects itself from request timing.

## Options

Set with `/plugin configure cache-control@claude-mods`:

| Option | Default | |
| --- | --- | --- |
| `ttl` | `auto` | `auto`, `5m` or `1h` |
| `guardMinTokens` | `50000` | Smallest context that asks before a cold send |
| `band` | `true` | Show the row above the prompt |
| `toast` | `true` | Warn shortly before a large cache expires |

## Where it works

Terminal and desktop app. In the terminal the bar is drawn in characters (`━━━━━━━━━`).

## Known limits

- Costs are API list-price estimates. On a subscription they're an equivalent, not a charge.
- "Cold" is estimated from the clock, not checked with the server.

## Credits

Ideas from [cache-tax](https://github.com/karanb192/cache-tax) and prompt-cache-control (claude-code-templates, MIT).
