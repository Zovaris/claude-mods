# nebula

A space look for the Claude desktop and mobile apps, in light and dark: a violet and rose nebula behind the conversation.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install nebula@claude-mods
```

Or from `/mods`, if you have [mod-manager](../../mods/mod-manager). It loads in your next session.

A theme applies when a new session starts in the Code tab.

## Colors

Violet-black grays with an orchid accent. Mint, amber, coral and rose keep their meaning for success, warning, danger and code. Built with the design system's `makeColors`, so surfaces, borders and code all follow.

## Scene

- A nebula sweeping in from the top-right corner: soft violet, magenta and rose clouds around a warm core, torn into wisps by fractal noise and cut by dark dust lanes.
- Stars follow a real sky's spread: a fine dust of faint points, fewer mid ones and a dozen bright ones in warm whites, thicker in the cloud. No halos, no crosses, no blue.
- Light mode keeps the cloud as a pale watercolor.
- The middle stays clear for the conversation. A few stars twinkle, and motion stops under reduced motion.

## Commands

`/nebula off` and `/nebula on`. The choice is kept. Only one theme draws at a time: switch from `/mods` to turn the others off for you.

## Where it works

Desktop and mobile apps. The terminal draws no themes.

## Credits

`hooks/make-colors.js` comes from Claude Code's plugin-authoring skill.
