# claude-mods

Mods and themes for [Claude Code](https://code.claude.com). The mods add features: switch tools, connectors and skills on and off, watch the prompt cache and the context window, pace your plan's usage limits, and manage it all from one pane. The themes change how the desktop app looks.

- [What's inside](#whats-inside)
- [Requirements](#requirements)
- [Install](#install)
- [Update and uninstall](#update-and-uninstall)
- [Where each one works](#where-each-one-works)
- [Mods](#mods): [tool-toggle](#tool-toggle) · [cache-control](#cache-control) · [usage-bar](#usage-bar) · [context-meter](#context-meter) · [mod-manager](#mod-manager)
- [Themes](#themes): [nebula](#nebula), [dunes](#dunes)
- [Development](#development)
- [License](#license)

## What's inside

| | Name | What it does | Command |
| --- | --- | --- | --- |
| Mod | [tool-toggle](mods/tool-toggle) | Turn connectors, MCP servers, single tools and skills on and off | `/tools` |
| Mod | [cache-control](mods/cache-control) | Prompt-cache meter, cold-send cost, a confirmation before an expensive cold send, keep-warm | `/cache` |
| Mod | [usage-bar](mods/usage-bar) | Your 5-hour, weekly and model usage windows, with pace and a daily budget | `/limits` |
| Mod | [context-meter](mods/context-meter) | What fills the context window, your own auto-compact threshold and summary style | `/context-meter` |
| Mod | [mod-manager](mods/mod-manager) | Every installed mod, theme and plugin: on, off, update, install | `/mods` |
| Theme | [nebula](themes/nebula) | A space look for light and dark, with a violet and rose nebula behind the conversation | `/nebula` |
| Theme | [dunes](themes/dunes) | A red desert drawn in ASCII, dusk in dark mode and noon in light | `/dunes` |

Mods live in [`mods/`](mods) and themes in [`themes/`](themes). Install only what you want: each one is its own plugin.

## Requirements

- **Claude Code 2.1.325 or newer.** Check with `claude --version`, or `/status` in the desktop app's Code tab.
- **For themes, a recent Claude desktop app.** If a theme says nothing draws it, update the app and restart it.
- **Access to this repository.** It's private: you need to be invited, with GitHub set up on your machine (`gh auth login`, or an SSH key).

## Install

### From the terminal

Add the marketplace once:

```bash
claude plugin marketplace add sthbryan/claude-mods
```

Then install what you want:

```bash
claude plugin install tool-toggle@claude-mods
```

```bash
claude plugin install cache-control@claude-mods
```

```bash
claude plugin install usage-bar@claude-mods
```

```bash
claude plugin install context-meter@claude-mods
```

```bash
claude plugin install mod-manager@claude-mods
```

```bash
claude plugin install nebula@claude-mods
```

```bash
claude plugin install dunes@claude-mods
```

### From inside a session

At the prompt, the same in one line each (answer `y` to add the marketplace, then pick a scope):

```
/plugin install tool-toggle --marketplace sthbryan/claude-mods
/plugin install cache-control --marketplace sthbryan/claude-mods
/plugin install usage-bar --marketplace sthbryan/claude-mods
/plugin install context-meter --marketplace sthbryan/claude-mods
/plugin install mod-manager --marketplace sthbryan/claude-mods
/plugin install nebula --marketplace sthbryan/claude-mods
/plugin install dunes --marketplace sthbryan/claude-mods
```

### In the desktop app

Click **+** next to the prompt box, then **Plugins** › **Add marketplace** with `sthbryan/claude-mods`, then **Add plugin** for each one.

New installs load in the next session. A theme applies when a new session starts in the Code tab.

## Update and uninstall

Plugins update by version: pull the marketplace, then update each plugin.

```bash
claude plugin marketplace update claude-mods
```

```bash
claude plugin update tool-toggle@claude-mods
```

```bash
claude plugin uninstall nebula@claude-mods
```

`claude plugin list` shows what's installed and its version. With mod-manager, `/mods` does all of this from a pane.

## Where each one works

| | Terminal (CLI) | Desktop app | Notes |
| --- | --- | --- | --- |
| tool-toggle | ✓ | ✓ | In the terminal, claude.ai connectors are blocked rather than switched off: their tools stay listed but can't run. |
| cache-control | ✓ | ✓ | Bars are drawn in characters in the terminal (`━━━━━━━━━`). |
| usage-bar | ✓ | ✓ | Same. Needs a Claude subscription: an API key reports no windows. |
| context-meter | ✓ | ✓ | Same. |
| mod-manager | ✓ | ✓ | Runs the `claude` command: from your PATH, or the desktop app's own copy on macOS. |
| nebula | — | ✓ | Themes are drawn by the desktop and mobile apps only. |
| dunes | — | ✓ | Same. |

The mobile app and VS Code haven't been tested.

## Mods

### tool-toggle

`/tools` opens a pane with everything the session can use, in sections: **Connectors**, **MCP servers**, **App servers**, **Built-in tools** and **Skills**, with a search box.

- **Connectors** (claude.ai) are switched for real in the desktop app, the same switch as **+** › **Connectors**, so their tools leave the model's list. The change applies when the turn ends.
- **MCP servers and single tools** are blocked: the model still sees them, but a call is denied with a reason it can act on.
- **Skills** turned off are denied at the Skill tool and give a notice when run by name. Where an organization's security plugin handles the skill listing first, the skill stays listed but still can't run.

From the prompt:

```
/tools                 open the pane
/tools off gmail       a connector or server, by name
/tools off Bash        a single tool
/tools off commit      a skill (skill:commit when a tool shares the name)
/tools on gmail        turn it back on
/tools list            what's off
```

Blocks are kept across sessions.

### cache-control

A row above the prompt shows the cache: a slim bar of what the last request read, wrote and sent new, the hit rate, a state (**warm**, **expiring**, **missed**, **cold**, **compacted**, **not cached**), the time left, and what a cold send would cost.

`/cache` (or **Details**) opens a pane with the time left, context size, hit rate, the cost of a cold send, what the cache saved, the last request, and a table of turns.

- **Confirm cold sends.** With the cache expired and a context of 50k tokens or more, it asks before your message goes out and shows the cost. `/cache guard off` turns it off.
- **Keep warm.** `/cache warm 2h` pings the cache shortly before it expires while you're idle (10 minutes before for a 1-hour cache, 1 minute for a 5-minute one). It stops by itself if the cache had already gone cold. `/cache warm off` stops it.
- **Cache lifetime.** Follows Claude Code's own rules (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `promptCacheTtl`, `ENABLE_PROMPT_CACHING_1H`, then the account) and corrects itself from request timing.

Costs are API list-price estimates. On a subscription they're an equivalent, not a charge. "Cold" is estimated from the clock, not checked with the server.

Options, set with `/plugin configure cache-control@claude-mods`:

| Option | Default | |
| --- | --- | --- |
| `ttl` | `auto` | `auto`, `5m` or `1h` |
| `guardMinTokens` | `50000` | Smallest context that asks before a cold send |
| `band` | `true` | Show the row above the prompt |
| `toast` | `true` | Warn shortly before a large cache expires |

### usage-bar

A row above the prompt with each usage window your plan reports: `5h`, `Week`, and a model's own week (such as Fable) when your plan has one. Each has a slim bar with a mark where an even pace would be now, its percentage, a state, and the time to its reset.

| State | When |
| --- | --- |
| under pace | more than 3 points below an even pace |
| on pace | within 3 points |
| over pace | 3 to 15 points above |
| well over pace | more than 15 points above |
| nearly full | 90% or more |
| limit reached | 100% |

`/limits` (or **Details**) opens a pane with, for each window:

- when it started and when it resets;
- where an even pace would be now, and how far over or under you are;
- how much you can use **per day** (weekly windows) or **per hour** (the 5-hour window) to last until the reset;
- what you've used today, and when you'd run out at the current pace.

Windows come from the latest API reply and refresh every minute. "Today" starts at the first reading on your local day.

### context-meter

A row above the prompt shows the context window: a slim bar split by what fills it (system prompt, tools, MCP tools, memory files, skills, agents, messages), the share used, a state (**roomy**, **filling**, **getting full**, **compacts soon**, **compacting next**), and a mark where auto-compact kicks in.

`/context-meter` (or **Details**) opens a pane with:

- the window used and what's free before auto-compact;
- every category with its tokens and share;
- memory files with their paths;
- MCP tools per server, with how many are loaded, and a pointer to `/tools` to switch heavy servers off;
- the skills and agents listings;
- **Compact now**, with an optional focus for what the summary should keep.

**Auto-compact, your way.** Claude Code compacts on its own near the end of the window. context-meter adds:

- **A threshold of your own:** compact at 20%, 35%, 50%, 65% or 80% of the window, well before Claude Code would.
- **Ask first, or don't:** at the threshold it asks whether to compact now, ask again 10 points later, or leave it for this session, and anything typed under **Other** becomes the summary's focus. Or it compacts without asking.
- **A summary style:** *Handoff* (goal, decisions and why, files, next steps), *Keep the code details* (paths, names, errors and commands verbatim), or your own text. By default the style also applies to `/compact` and Claude Code's own auto-compact.

From the prompt:

```
/context-meter auto 50        compact at 50% of the window
/context-meter auto off       turn it off
/context-meter ask            ask first at the threshold
/context-meter compact        compact without asking
/context-meter style handoff  default, handoff, code or custom
```

The breakdown is the one `/context` draws, estimated locally after each turn (no extra requests). Settings are kept across sessions.

### mod-manager

`/mods` opens a pane over everything installed: **Mods**, **Themes** and **Other plugins**, each with its version and marketplace, plus what your marketplaces offer that you haven't installed.

- **Enable** or **Disable** any of them.
- **Update** when the marketplace has a newer version; **Check for updates** pulls your marketplaces first.
- **Install** from the **Available** section.
- Themes are one at a time: turning one on turns the others off, and the look switches right away when the session has that theme loaded.
- After a change, **Reload plugins** loads it in the current session. Sessions that can't reload plugins (the desktop app's) load it in the next session, and the pane says so.

It reads Claude Code's own files and writes none: every change goes through the `claude plugin` command. If it can't find the command, the command is copied to your clipboard to run yourself.

## Themes

Only one theme can be active at a time: the last one set wins. Turn a theme off with its own command, or switch from `/mods`, which turns the others off for you.

### nebula

A look for the desktop and mobile apps, in light and dark.

- **Colors.** Violet-black grays with an orchid accent. Mint, amber, coral and rose keep their meaning for success, warning, danger and code. Built with the design system's `makeColors`, so surfaces, borders and code all follow.
- **Scene.** A nebula sweeping in from the top-right corner: soft violet, magenta and rose clouds around a warm core, torn into wisps by fractal noise and cut by dark dust lanes. Stars follow a real sky's spread, a fine dust of faint points, fewer mid ones and a dozen bright ones in warm whites, thicker in the cloud. No halos, no crosses, no blue. Light mode keeps the cloud as a pale watercolor. The middle stays clear for the conversation; a few stars twinkle, and motion stops under reduced motion.

`/nebula off` and `/nebula on` switch it, and the choice is kept.

### dunes

A red desert drawn in ASCII, for the desktop and mobile apps, in light and dark.

- **Colors.** Rust-black grays with a vermilion accent. Danger leans crimson so it stays apart from the accent; sage, amber and rose keep their meaning.
- **Scene.** Three ranges of dunes on a 160 × 60 character grid, each shaded the way sand is lit by a low sun on the right: faces toward it dense and bright (`=+*#%`), backs sparse and dark (`.:-`), the light and shade meeting in diagonals down from each crest, the near ranges rippled by the wind. The sky is an ordered dither of dots that thickens toward the horizon and the sun, a disk of `@` sinking behind the far range. Dark mode is dusk with a few stars; light mode is noon, the same desert printed in terracotta on sand. Sand blows across the ridges, and motion stops under reduced motion.
- **Any font.** Each run of characters is stretched to its cells, so the grid stays aligned in whatever monospace font the app has.

`/dunes off` and `/dunes on` switch it, and the choice is kept.

## Development

```
.claude-plugin/marketplace.json   the marketplace: one entry per plugin
mods/<name>/                      a mod
themes/<name>/                    a theme
  .claude-plugin/plugin.json      name, version, options
  hooks/hooks.json                the hooks module to load
  hooks/register.tsx              the mod itself
  tests/*.test.tsx                tests
  types/index.d.ts                the mod's state contract, where it keeps state
```

Check and test a plugin the way the engine will:

```bash
claude plugin validate mods/cache-control
```

```bash
claude plugin test mods/cache-control
```

Try a plugin from its folder without installing it; it reloads as you edit:

```bash
claude --plugin-dir mods/cache-control
```

**Shipping a change.** Installed copies update by version, so raise `version` in the plugin's `plugin.json`, push, then run `claude plugin marketplace update claude-mods` and `claude plugin update <name>@claude-mods`.

`hooks/slim.tsx` (the slim bar and the state chips) is the same file in usage-bar, cache-control, context-meter and mod-manager. Keep the copies in sync.

## Credits

cache-control's ideas come from [cache-tax](https://github.com/karanb192/cache-tax) and prompt-cache-control (claude-code-templates, MIT). The themes' `make-colors.js` comes from Claude Code's plugin-authoring skill.

## License

[MIT](LICENSE) © 2026 Bryan Villafuerte
