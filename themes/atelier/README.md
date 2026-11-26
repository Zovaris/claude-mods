# atelier

Quiet dot-dither looks for the Claude desktop and mobile apps, on Claude's own warm grays and ivory. Two scenes, four tints, light and dark. It replaces the old `nebula` and `dunes` themes.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install atelier@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). A theme applies when a new session starts in the Code tab.

## Scenes

- **Ember** (default): a low sun rising out of the bottom-right corner, printed as an ordered dither of square dots, with a thin rim of horizon. The rest of the frame stays empty.
- **Beam**: one streak of light crossing from the left edge that thins to a line and ends in a spark.

Both have faint film grain on top and breathe slowly; motion stops under reduced motion. Light mode prints the same dots on ivory.

## Tints

The tint colors the dots and is the app's accent too: **clay** (default, `#d97757`), **cobalt**, **sage** and **ivory** (near-monochrome).

## Commands

`/atelier` shows what's on and what you can pick. `/atelier beam`, `/atelier sage`, `/atelier ember cobalt` switch, and `/atelier off` turns it off. The choice is kept.

## Where it works

Desktop and mobile apps. The terminal draws no themes.

## Credits

`hooks/make-colors.js` comes from Claude Code's plugin-authoring skill.
