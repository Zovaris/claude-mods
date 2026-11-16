# dunes

A red desert drawn in ASCII for the Claude desktop and mobile apps: dusk in dark mode, noon in light.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install dunes@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

A theme applies when a new session starts in the Code tab.

## Colors

Rust-black grays with a vermilion accent. Danger leans crimson so it stays apart from the accent; sage, amber and rose keep their meaning.

## Scene

- Three ranges of dunes on a 160 × 60 character grid, lit by a low sun on the right: faces toward it dense and bright (`=+*#%`), backs sparse and dark (`.:-`), light and shade meeting in diagonals down from each crest, the near ranges rippled by the wind.
- The sky is an ordered dither of dots that thickens toward the horizon and the sun, a disk of `@` sinking behind the far range.
- Dark mode is dusk with a few stars; light mode is noon, the same desert printed in terracotta on sand.
- Sand blows across the ridges, and motion stops under reduced motion.
- Each run of characters is stretched to its cells, so the grid stays aligned in whatever monospace font the app has.

## Commands

`/dunes off` and `/dunes on`. The choice is kept. Only one theme draws at a time: switch from `/mods` to turn the others off for you.

## Where it works

Desktop and mobile apps. The terminal draws no themes.

## Credits

`hooks/make-colors.js` comes from Claude Code's plugin-authoring skill.
