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

The time left changes color as it runs out: plain over half its lifetime, amber under half, amber with ⚠ under a quarter, and red with ⚠ in the last minutes and once it has expired, when it shows how long ago.

| State | Meaning |
| --- | --- |
| warm | the cache is alive and was read |
| cooling | under a quarter of its lifetime left |
| expiring | the last 5 minutes of a 1-hour cache, the last minute of a 5-minute one |
| missed | the last request rewrote what it should have read |
| cold | the cache has expired; the next send pays full price |
| compacted | the conversation was just compacted |
| not cached | nothing was cached |
| no requests | nothing sent yet this session |

## The pane

`/cache`, or **Details** on the row: time left, context size, hit rate, the cost of a cold send, what the cache saved, the last request, and a table of turns.

## Features

- **Confirm cold sends.** With the cache expired and a context of 50k tokens or more, it asks before your message goes out: how long ago it expired, how many tokens go out uncached, and what that costs against a warm cache. `/cache guard off` turns it off.
- **In your language.** The question and the expiry warning speak the language you write your prompts in (English, Spanish, Portuguese or French), or Claude Code's `language` setting when you have one. English until it can tell.
- **Subscription or API.** On a Claude subscription a cold send costs no money, it uses more of your plan's limits, so the row, the question and the warning say how many times a warm send it weighs, with the API price beside it as a reference. **Show API prices** in the pane, or `/cache prices off`, leaves the plan weight alone. On the API, or once you're past your plan's limits, they say what it costs.
- **Extend the cache.** The cache lasts its own lifetime after your last message (1 hour on a subscription) at no cost. **+1 hour**, **+3 hours** or **+8 hours** in the pane (or `/cache warm 2h`) keeps it past that, with a ping just before each expiry while you're idle. **Off**, or `/cache stop`, ends the extension: no more pings, and the cache runs out on its own. It's for this session only, and when you write again everything carries on.
- **An idle cache costs nothing.** The countdown is the cache running out on its own: nothing is sent and nothing is charged while keep-warm is **Off**, and your next message starts it over. Only messages and keep-warm pings count.
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

- Dollar costs are API list-price estimates. The "times a warm send" on a subscription is the same price ratio, the closest measure of how much of your limits it uses.
- "Cold" is estimated from the clock, not checked with the server.

## Credits

Ideas from [cache-tax](https://github.com/karanb192/cache-tax) and prompt-cache-control (claude-code-templates, MIT).
