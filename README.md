# claude-mods

Mods for Claude Code: a switchboard for tools and connectors, a prompt-cache meter, and a look.

| Mod | What it does | Command |
| --- | --- | --- |
| [tool-toggle](plugins/tool-toggle) | Turn claude.ai connectors, MCP servers and single tools on and off from a pane | `/tools` |
| [cache-control](plugins/cache-control) | Prompt-cache meter with a countdown, cold-send cost, a confirmation before expensive cold sends, and keep-warm pings | `/cache` |
| [nebula](plugins/nebula) | Nebula: a deep-space look for light and dark, with a starfield, nebula glows and a ringed planet | `/nebula` |

## Install

At the prompt of a terminal session:

```
/plugin install tool-toggle --marketplace sthbryan/claude-mods
/plugin install cache-control --marketplace sthbryan/claude-mods
/plugin install nebula --marketplace sthbryan/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. From a shell, use `claude plugin install <mod> --marketplace sthbryan/claude-mods`.

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `sthbryan/claude-mods`, then **Add plugin**.

The repository is private, so installing needs GitHub access to it on your computer.

## tool-toggle

`/tools` opens a pane with every connector, MCP server and tool in the session, grouped and searchable.

- **Connectors** (claude.ai) are switched for real, the same switch as + › Connectors, so their tools leave the model's list. The change applies when the turn ends.
- **Other servers and single tools** are blocked: the model still sees them, but a call is denied with a reason.
- From the prompt: `/tools off gmail`, `/tools on slack`, `/tools list`.

Blocks are kept across sessions.

## cache-control

A band above the prompt shows the cache state (warm, expiring soon, cold, compacted), the hit rate, a countdown to expiry and what a cold send would cost. `/cache` opens a pane with the last request split into read / written / new tokens, the session's cost and savings, and a table per turn.

- **Cold-send confirmation:** with the cache expired and a context of 50k tokens or more, asks before your message goes out. `/cache guard off` turns it off.
- **Keep warm:** `/cache warm 2h` sends a tool-less ping shortly before the cache expires while you are idle (10 min before for a 1-hour cache, 1 min for a 5-minute one). It stops by itself if the cache had already gone cold.
- **Cache lifetime:** follows Claude Code's rules (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `promptCacheTtl`, `ENABLE_PROMPT_CACHING_1H`, then the account type) and corrects itself from request timing. The `ttl` option pins it.

Costs are API list-price estimates; on a subscription they are an equivalent, not a charge. "Cold" is estimated from the clock, not checked with the server.

Options: `ttl` (`auto`, `5m`, `1h`), `guardMinTokens`, `band`, `toast`.

Ideas from [cache-tax](https://github.com/karanb192/cache-tax) and prompt-cache-control (claude-code-templates, MIT).

## nebula

A look for the desktop and mobile apps, in light and dark:

- **Colors:** deep-space grays with a violet accent; mint, amber, coral and cyan keep their meaning for success, warning, danger and code. Built with the design system's `makeColors`, so every surface, border and code color follows.
- **Scene:** a seeded starfield with twinkling stars and a few bright glints, nebula glows drifting at the edges, a ringed planet low on the right, and a shooting star now and then. The middle stays quiet for the conversation, and the motion stops under reduced motion.

It applies to the Code tab of the desktop app and to the mobile app, from the next session after it's installed. `/nebula off` and `/nebula on` switch it; the choice is kept. Needs Claude Code 2.1.325 or newer.

## Development

Each mod has tests: `claude plugin test plugins/<mod>`, and `claude plugin validate plugins/<mod>` checks it the way the engine will.

## License

MIT
