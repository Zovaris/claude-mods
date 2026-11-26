# atelier

Quiet dot-dither looks for the Claude desktop and mobile apps, on Claude's own warm grays and ivory. Ten scenes, ten tints, light and dark. It replaces the old `nebula` and `dunes` themes, which live on here redrawn as dither.

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
- **Dunes**: three ridges of sand lit from a low sun on the right, fading into the dark below.
- **Nebula**: soft puffs of gas sweeping in from the top-right, torn into wisps at the rim, with sparse stars.
- **Tide**: a few thin swells rolling across the bottom, brighter as they come near.
- **Orbit**: a small ringed planet high on the left.
- **Aurora**: soft curtains of light hanging from the top, swaying and fading downward.
- **Castle**: a dark keep with spired towers on a crag, under a huge low moon, two windows lit.
- **Warrior**: a horned warrior with a torn cape and a planted greatsword, backlit by a low sun.
- **Boulevard**: a striped sun setting behind a city skyline, with palms along the shore.

Castle, Warrior and Boulevard are silhouettes: the figure is the dark left empty in front of the light.

All have faint film grain on top and breathe slowly; motion stops under reduced motion. Light mode prints the same dots on ivory.

## Tints

The tint colors the dots and is the app's accent too: **clay** (default, `#d97757`), **cobalt**, **sage**, **ivory** (near-monochrome), **rose**, **amber**, **teal**, **violet**, **crimson** and **slate**.

## Commands

`/atelier` shows what's on and what you can pick. `/atelier beam`, `/atelier sage`, `/atelier ember cobalt` switch, and `/atelier off` turns it off. The choice is kept.

## Where it works

Desktop and mobile apps. The terminal draws no themes.

## Credits

`hooks/make-colors.js` comes from Claude Code's plugin-authoring skill.
