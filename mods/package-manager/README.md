# package-manager

Each project's JavaScript package manager, found on its own and used. Claude tends to reach for `npm`; in a bun, pnpm or yarn project this mod makes sure the project's own manager runs instead.

No row, no pane: install it and it works.

## Install

```bash
claude plugin marketplace add Zovaris/claude-mods
```

```bash
claude plugin install package-manager@claude-mods
```

Or from `/mods`, if you have [mod-manager](../mod-manager). It loads in your next session.

## How it detects

Looking up from the folder a command runs in, so a monorepo's root lockfile counts, the first match wins:

1. the `packageManager` field in `package.json` (Corepack's `"pnpm@9.1.0"`);
2. the lockfile: `bun.lock` or `bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn (Yarn 2+ when there's a `.yarnrc.yml`), `package-lock.json` → npm.

No `package.json` lockfile or field, as in a Go, Rust or Python project: it finds nothing and does nothing.

## What it does

- **Tells Claude** which manager the project uses, so it picks the right one from the start.
- **Rewrites the command** when Claude calls another one anyway, and tells it what ran instead:

| Claude runs | In a bun project | In a pnpm project |
| --- | --- | --- |
| `npm install` | `bun install` | `pnpm install` |
| `npm i -D vitest` | `bun add -d vitest` | `pnpm add -D vitest` |
| `npm ci` | `bun install --frozen-lockfile` | `pnpm install --frozen-lockfile` |
| `npm run build` | `bun run build` | `pnpm run build` |
| `npm test` | `bun run test` | `pnpm test` |
| `npm uninstall lodash` | `bun remove lodash` | `pnpm remove lodash` |
| `npx tsc` (installed in the project) | `bunx tsc` | `pnpm exec tsc` |
| `npx create-vite app` (not installed) | `bunx create-vite app` | `pnpm dlx create-vite app` |

It works the other way too: `bun add zod` in an npm project runs as `npm install zod`, and the same for pnpm and yarn.

Left exactly as written: global installs (`-g`), flags with no equivalent (`--legacy-peer-deps`), anything inside quotes or with shell syntax, commands it doesn't know (`npm init`, `npm publish`), and `bun test`, which is bun's own test runner.

## Commands

```
/pm         what it detected here, and whether it's on
/pm off     turn it off for this project only
/pm on      turn it back on for this project
```

## Where it works

Terminal and desktop app. Nothing to see: it acts on Bash commands and on what Claude is told.
