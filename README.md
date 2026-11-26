# claude-mods

Mods and themes for [Claude Code](https://code.claude.com). Mods add features to the terminal and the desktop app; themes change how the desktop and mobile apps look. Each one is its own plugin: install only what you want.

## Mods

| | What it does | Command |
| --- | --- | --- |
| [tool-toggle](mods/tool-toggle) | Turn connectors, MCP servers, single tools and skills on and off | `/tools` |
| [cache-control](mods/cache-control) | Prompt-cache meter, cold-send cost and confirmation, keep-warm | `/cache` |
| [usage-bar](mods/usage-bar) | Your plan's usage windows, with pace and a daily budget | `/limits` |
| [context-meter](mods/context-meter) | What fills the context window, and an auto-compact of your own | `/context-meter` |
| [mod-manager](mods/mod-manager) | Every mod, theme and plugin: on, off, update, install | `/mods` |
| [package-manager](mods/package-manager) | Detects npm, pnpm, yarn or bun per project and runs that one | `/pm` |

## Themes

| | Look | Command |
| --- | --- | --- |
| [atelier](themes/atelier) | Quiet dot-dither scenes on Claude's warm grays, in four tints | `/atelier` |

Each folder has its own README with everything it does, its commands and options.

## Requirements

- **Claude Code 2.1.325 or newer.** Check with `claude --version`.
- **For themes, a recent Claude desktop app.**

## Install

Add the marketplace once:

```bash
claude plugin marketplace add Zovaris/claude-mods
```

Then install each one you want by name:

```bash
claude plugin install context-meter@claude-mods
```

Inside a session, `/plugin install <name> --marketplace Zovaris/claude-mods` does both. In the desktop app: **+** › **Plugins** › **Add marketplace** with `Zovaris/claude-mods`, then **Add plugin**. Start with [mod-manager](mods/mod-manager) and `/mods` installs the rest from a pane.

New installs load in the next session.

## Update and uninstall

Plugins update by version: pull the marketplace, then update each plugin.

```bash
claude plugin marketplace update claude-mods
```

```bash
claude plugin update context-meter@claude-mods
```

```bash
claude plugin uninstall context-meter@claude-mods
```

## Where each one works

| | Terminal | Desktop app |
| --- | --- | --- |
| Mods | ✓ | ✓ |
| Themes | — | ✓ |

Bars are drawn in characters in the terminal. The mobile app and VS Code haven't been tested. Each README lists its own limits.

## Development

```
.claude-plugin/marketplace.json   the marketplace: one entry per plugin
mods/<name>/                      a mod
themes/<name>/                    a theme
  README.md                       what it does, for people
  .claude-plugin/plugin.json      name, version, options
  hooks/hooks.json                the hooks module to load
  hooks/register.tsx              the plugin itself
  tests/*.test.tsx                tests
  types/index.d.ts                its state contract, where it keeps state
```

Check and test a plugin the way the engine will:

```bash
claude plugin validate mods/cache-control
```

```bash
claude plugin test mods/cache-control
```

Try one from its folder without installing it; it reloads as you edit:

```bash
claude --plugin-dir mods/cache-control
```

**Shipping a change.** Installed copies update by version: raise `version` in the plugin's `plugin.json`, push, then `claude plugin marketplace update claude-mods` and `claude plugin update <name>@claude-mods`.

`hooks/slim.tsx` (the slim bar and the state chips) is the same file in usage-bar, cache-control, context-meter and mod-manager. Keep the copies in sync.

## License

[MIT](LICENSE)
