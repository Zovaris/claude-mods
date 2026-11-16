/**
 * package-manager: each project's JavaScript package manager, found on its
 * own, and used.
 *
 *   - Detects npm, pnpm, yarn or bun from the project's `packageManager`
 *     field or lockfile, looking up from the folder the command runs in (so
 *     a monorepo's root lockfile counts).
 *   - Rewrites Bash commands that call another manager: `npm install` becomes
 *     `bun install` in a bun project, `npx tsc` becomes `bunx tsc`. The model
 *     is told what ran in its place.
 *   - Tells the model which manager the project uses, so it reaches for the
 *     right one in the first place.
 *
 * Outside a JavaScript project (Go, Rust, Python…) it finds nothing and does
 * nothing. `/pm` says what it found; `/pm off` and `/pm on` switch it for the
 * current project only.
 */
import type { EngineInterface, Register } from 'claude-code'

import { detectIn, leadingCd, rewrite } from './pm'
import type { Detected } from './pm'

type Found = (Detected & { root: string }) | null

const CACHE_MS = 30_000
const MAX_UP = 8
const cache = new Map<string, { at: number; found: Found }>()

const parentOf = (dir: string) => {
  const i = dir.replace(/\/+$/, '').lastIndexOf('/')
  return i <= 0 ? '/' : dir.slice(0, i)
}

const join = (dir: string, rel: string) => (rel.startsWith('/') ? rel : `${dir.replace(/\/+$/, '')}/${rel}`)

/** Looks up from `dir` for the folder that names a manager. */
async function detect($: EngineInterface, dir: string): Promise<Found> {
  const now = await $.clock.now()
  const hit = cache.get(dir)
  if (hit && now - hit.at < CACHE_MS) return hit.found
  let found: Found = null
  let cur = dir
  for (let i = 0; i < MAX_UP; i++) {
    const names = new Set((await $.fs.list(cur).catch(() => [])).map(f => f.name))
    let field: unknown
    if (names.has('package.json')) {
      try {
        field = (JSON.parse(await $.fs.read(`${cur}/package.json`)) as { packageManager?: unknown }).packageManager
      } catch {
        // unreadable package.json: the lockfile still decides
      }
    }
    const d = detectIn(names, field)
    if (d) {
      found = { ...d, root: cur }
      break
    }
    // The top of a repository, or the filesystem: stop.
    if (names.has('.git') || cur === '/') break
    cur = parentOf(cur)
  }
  cache.set(dir, { at: now, found })
  return found
}

const isOff = async ($: EngineInterface, root: string) => {
  const off = ((await $.store.get('off').catch(() => undefined)) as string[] | undefined) ?? []
  return off.includes(root)
}

const advice = (f: NonNullable<Found>) => {
  const x = f.pm === 'npm' ? 'npx' : f.pm === 'bun' ? 'bunx' : `${f.pm} dlx`
  const add = f.pm === 'npm' ? 'npm install <pkg>' : `${f.pm} add <pkg>`
  return (
    `This project's package manager is ${f.pm} (from ${f.why}). Use ${f.pm} and ${x}, not other package managers: ` +
    `${f.pm} install, ${add}, ${f.pm} run <script>, ${x} <tool>.` +
    (f.pm === 'bun' ? ' Run package.json scripts with `bun run test`, since `bun test` is bun\'s own test runner.' : '')
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command
      .register({ name: 'pm', description: "This project's package manager: what was detected, or off/on here", argumentHint: '[off|on]' })
      .catch(err => $.ui.log(`package-manager: /pm not registered: ${String(err)}`, { to: 'debug' }))
    return r
  })

  // The safety net: a command for another manager runs as this project's.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = typeof e.command === 'string' ? e.command : ''
    if (!/\b(npm|npx|pnpm|yarn|bunx?)\b/.test(command)) return next(e)
    const cwd = await $.session.cwd().catch(() => undefined)
    if (!cwd) return next(e)
    const cd = leadingCd(command)
    const found = await detect($, cd ? join(cwd, cd) : cwd)
    if (!found || (await isOff($, found.root))) return next(e)
    const bins = new Set((await $.fs.list(`${found.root}/node_modules/.bin`).catch(() => [])).map(f => f.name))
    const { command: rewritten, changes } = rewrite(command, found, bin => bins.has(bin))
    if (changes.length === 0) return next(e)
    const r = await next({ ...e, command: rewritten })
    if ('deny' in r && r.deny !== undefined) return r
    const said = changes.map(c => `"${c.from}" ran as "${c.to}"`).join(', ')
    return { ...r, context: [...(r.context ?? []), `package-manager: this project uses ${found.pm} (${found.why}), so ${said}. ${advice(found)}`] }
  })

  // The first line of defense: the model knows the manager before it types.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const cwd = await $.session.cwd().catch(() => undefined)
    const found = cwd ? await detect($, cwd).catch(() => null) : null
    if (!found || (await isOff($, found.root))) return r
    return { ...r, sections: [...r.sections, { id: 'package-manager', text: advice(found), scope: 'session' as const }] }
  })

  on('command.run', { command: 'pm' }, async ($, e) => {
    const cwd = await $.session.cwd().catch(() => undefined)
    if (!cwd) return { text: 'No working folder for this session.' }
    cache.delete(cwd)
    const found = await detect($, cwd)
    const arg = e.args.trim().toLowerCase()
    if (!found) return { text: 'No package.json lockfile or packageManager field found here: nothing to do in this project.' }
    const off = ((await $.store.get('off').catch(() => undefined)) as string[] | undefined) ?? []
    if (arg === 'off' || arg === 'on') {
      const next = arg === 'off' ? [...new Set([...off, found.root])] : off.filter(x => x !== found.root)
      await $.store.set('off', next)
      return { text: `package-manager is ${arg} for ${found.root}. Other projects are unchanged.` }
    }
    const state = off.includes(found.root) ? 'off here (/pm on to turn it back on)' : 'on'
    return { text: `${found.pm}, from ${found.why} in ${found.root}. package-manager is ${state}.` }
  })
}
