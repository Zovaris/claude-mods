/**
 * The pure half of package-manager, no `$`: which manager a project uses, and
 * a command rewritten for it.
 *
 * Detection, first match wins: the `packageManager` field of package.json
 * (Corepack's "pnpm@9.1.0"), then the lockfile (bun.lock or bun.lockb, pnpm-lock.yaml,
 * yarn.lock, package-lock.json or npm-shrinkwrap.json). A package.json with
 * neither says nothing, and nothing is rewritten.
 *
 * Rewriting understands npm, npx, pnpm, yarn, bun and bunx, turns each command
 * into an operation (install, add, remove, run, dlx…) and writes it back for
 * the project's manager. Only commands at the start of the line or after
 * `&&`, `||`, `;` or `|` are touched, never text inside quotes, and anything it
 * doesn't understand (global installs, `npm init`, `npm publish`…) is left as
 * it is.
 */

export type PM = 'npm' | 'pnpm' | 'yarn' | 'bun'
export type Detected = { pm: PM; why: string; yarnBerry: boolean }

const LOCKS: [string, PM][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
]

/** What one folder says: a manager, or nothing. */
export function detectIn(files: ReadonlySet<string>, packageManagerField?: unknown): Detected | null {
  const yarnBerry = files.has('.yarnrc.yml')
  if (typeof packageManagerField === 'string') {
    const name = packageManagerField.split('@')[0]
    if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
      const major = Number.parseInt(packageManagerField.split('@')[1] ?? '', 10)
      return { pm: name, why: `"packageManager": "${packageManagerField}"`, yarnBerry: name === 'yarn' && (yarnBerry || major >= 2) }
    }
  }
  for (const [file, pm] of LOCKS) if (files.has(file)) return { pm, why: file, yarnBerry: pm === 'yarn' && yarnBerry }
  return null
}

// ---- parsing ------------------------------------------------------------------

/** Splits a command line at `&&`, `||`, `;` and `|`, outside quotes, keeping the separators. */
export function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      cur += c
      if (c === quote && line[i - 1] !== '\\') quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      cur += c
      continue
    }
    const two = line.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      out.push(cur, two)
      cur = ''
      i++
      continue
    }
    if (c === ';' || c === '|' || c === '\n') {
      out.push(cur, c)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

type Op =
  | { kind: 'install' }
  | { kind: 'ci' }
  | { kind: 'add'; dev: boolean; rest: string[] }
  | { kind: 'remove'; rest: string[] }
  | { kind: 'run'; script: string; rest: string[] }
  | { kind: 'script'; script: 'test' | 'start'; rest: string[] }
  | { kind: 'dlx'; rest: string[] }
  | { kind: 'exec'; rest: string[] }

const DEV = new Set(['-D', '--save-dev', '--dev', '-d'])
const DROP = new Set(['-S', '--save', '--save-prod', '-P'])
const GLOBAL = new Set(['-g', '--global', 'global'])

const FROZEN = new Set(['--frozen-lockfile', '--immutable'])
/** True when a frozen install carries nothing else: any other flag has no safe translation. */
const onlyFrozen = (args: string[]) => args.every(a => FROZEN.has(a))
/** npm reads flags before `--` as its own, so what Claude meant for the script isn't passed on. */
const npmOwnFlags = (args: string[]) => {
  const at = args.indexOf('--')
  return (at < 0 ? args : args.slice(0, at)).some(a => a.startsWith('-'))
}

const pkgs = (args: string[]) => args.filter(a => !DEV.has(a) && !DROP.has(a))
const isDev = (args: string[]) => args.some(a => DEV.has(a))
/** A flag we can't translate between managers (--legacy-peer-deps…): such a command is left alone. */
const hasOtherFlags = (args: string[]) => args.some(a => a.startsWith('-') && !DEV.has(a) && !DROP.has(a))

/** A command's words as an operation, or null when it isn't one we rewrite. */
export function parse(words: string[]): Op | null {
  const [tool, sub = '', ...rest] = words
  if (!tool) return null
  if (words.some(w => GLOBAL.has(w))) return null
  const sub0 = words[1] ?? ''
  if (['install', 'i', 'add', 'a', 'uninstall', 'remove', 'rm', 'un'].includes(sub0) && hasOtherFlags(words.slice(2).filter(a => !(tool !== 'npm' && (sub0 === 'install' || sub0 === 'i') && FROZEN.has(a))))) return null
  if (tool === 'npx' || tool === 'bunx') return words.length > 1 ? { kind: 'dlx', rest: words.slice(1) } : null
  if (tool === 'npm') {
    if (sub === 'ci') return rest.length === 0 ? { kind: 'ci' } : null
    if (sub === 'install' || sub === 'i' || sub === 'add' || sub === 'isntall') {
      const p = pkgs(rest)
      if (p.length === 0) return rest.length === 0 ? { kind: 'install' } : null
      return { kind: 'add', dev: isDev(rest), rest: p }
    }
    if (sub === 'uninstall' || sub === 'remove' || sub === 'rm' || sub === 'un') return pkgs(rest).length ? { kind: 'remove', rest: pkgs(rest) } : null
    if (sub === 'run' || sub === 'run-script') return rest[0] && !npmOwnFlags(rest.slice(1)) ? { kind: 'run', script: rest[0], rest: rest.slice(1) } : null
    if (sub === 'test' || sub === 't') return npmOwnFlags(rest) ? null : { kind: 'script', script: 'test', rest }
    if (sub === 'start') return npmOwnFlags(rest) ? null : { kind: 'script', script: 'start', rest }
    if (sub === 'exec' || sub === 'x') return rest.length ? { kind: 'exec', rest: rest[0] === '--' ? rest.slice(1) : rest } : null
    return null
  }
  if (tool === 'pnpm') {
    if (sub === 'install' || sub === 'i') return rest.length === 0 ? { kind: 'install' } : rest.includes('--frozen-lockfile') && onlyFrozen(rest) ? { kind: 'ci' } : null
    if (sub === 'add') return pkgs(rest).length ? { kind: 'add', dev: isDev(rest), rest: pkgs(rest) } : null
    if (sub === 'remove' || sub === 'rm' || sub === 'uninstall' || sub === 'un') return pkgs(rest).length ? { kind: 'remove', rest: pkgs(rest) } : null
    if (sub === 'run') return rest[0] ? { kind: 'run', script: rest[0], rest: rest.slice(1) } : null
    if (sub === 'test' || sub === 'start') return { kind: 'script', script: sub, rest }
    if (sub === 'dlx') return rest.length ? { kind: 'dlx', rest } : null
    if (sub === 'exec') return rest.length ? { kind: 'exec', rest } : null
    return null
  }
  if (tool === 'yarn') {
    if (sub === '' || sub === 'install') {
      if (rest.length === 0) return { kind: 'install' }
      return rest.some(a => FROZEN.has(a)) && onlyFrozen(rest) ? { kind: 'ci' } : null
    }
    if (sub === 'add') return pkgs(rest).length ? { kind: 'add', dev: isDev(rest), rest: pkgs(rest) } : null
    if (sub === 'remove') return pkgs(rest).length ? { kind: 'remove', rest: pkgs(rest) } : null
    if (sub === 'run') return rest[0] ? { kind: 'run', script: rest[0], rest: rest.slice(1) } : null
    if (sub === 'test' || sub === 'start') return { kind: 'script', script: sub, rest }
    if (sub === 'dlx') return rest.length ? { kind: 'dlx', rest } : null
    if (sub === 'exec') return rest.length ? { kind: 'exec', rest } : null
    return null
  }
  if (tool === 'bun') {
    if (sub === 'install' || sub === 'i') {
      if (rest.includes('--frozen-lockfile')) return onlyFrozen(rest) ? { kind: 'ci' } : null
      const p = pkgs(rest)
      if (p.length === 0) return rest.length === 0 ? { kind: 'install' } : null
      return { kind: 'add', dev: isDev(rest), rest: p }
    }
    if (sub === 'add' || sub === 'a') return pkgs(rest).length ? { kind: 'add', dev: isDev(rest), rest: pkgs(rest) } : null
    if (sub === 'remove' || sub === 'rm') return pkgs(rest).length ? { kind: 'remove', rest: pkgs(rest) } : null
    if (sub === 'run') return rest[0] ? { kind: 'run', script: rest[0], rest: rest.slice(1) } : null
    if (sub === 'x') return rest.length ? { kind: 'dlx', rest } : null
    // `bun test` is bun's own test runner, not the "test" script: left alone.
    return null
  }
  return null
}

/** The script's arguments for a manager: npm needs `--` before flags meant for the script. */
const forScript = (pm: PM, args: string[]) => (pm === 'npm' && args.some(a => a.startsWith('-')) && !args.includes('--') ? ['--', ...args] : args)

/** An operation written for a manager. */
export function render(op: Op, d: Detected): string {
  const { pm } = d
  const tail = (xs: string[]) => (xs.length ? ` ${xs.join(' ')}` : '')
  switch (op.kind) {
    case 'install':
      return `${pm} install`
    case 'ci':
      return pm === 'npm' ? 'npm ci' : pm === 'yarn' ? (d.yarnBerry ? 'yarn install --immutable' : 'yarn install --frozen-lockfile') : `${pm} install --frozen-lockfile`
    case 'add': {
      const dev = op.dev ? (pm === 'bun' ? ' -d' : ' -D') : ''
      return `${pm === 'npm' ? 'npm install' : `${pm} add`}${dev}${tail(op.rest)}`
    }
    case 'remove':
      return `${pm === 'npm' ? 'npm uninstall' : `${pm} remove`}${tail(op.rest)}`
    case 'run':
      return `${pm} run ${op.script}${tail(forScript(pm, op.rest))}`
    case 'script':
      // `bun test` would run bun's own test runner, so the script goes through `bun run`.
      return pm === 'bun' ? `bun run ${op.script}${tail(forScript(pm, op.rest))}` : `${pm} ${op.script}${tail(forScript(pm, op.rest))}`
    case 'dlx':
      return pm === 'npm' ? `npx${tail(op.rest)}` : pm === 'pnpm' ? `pnpm dlx${tail(op.rest)}` : pm === 'bun' ? `bunx${tail(op.rest)}` : d.yarnBerry ? `yarn dlx${tail(op.rest)}` : `npx${tail(op.rest)}`
    case 'exec':
      return pm === 'npm' ? `npx${tail(op.rest)}` : pm === 'pnpm' ? `pnpm exec${tail(op.rest)}` : pm === 'bun' ? `bunx${tail(op.rest)}` : d.yarnBerry ? `yarn exec${tail(op.rest)}` : `yarn run${tail(op.rest)}`
  }
}

const MANAGERS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx'])
const TOOL_PM: Record<string, PM> = { npm: 'npm', npx: 'npm', pnpm: 'pnpm', yarn: 'yarn', bun: 'bun', bunx: 'bun' }
const YES = new Set(['-y', '--yes'])

export type Rewrite = { command: string; changes: { from: string; to: string }[] }

/**
 * The command with every package-manager call rewritten for `d`; unchanged
 * when nothing applies. `isLocal` says whether a tool is installed in the
 * project, so `npx tsc` runs the project's own tsc (`pnpm exec tsc`) rather
 * than downloading one (`pnpm dlx tsc`).
 */
export function rewrite(command: string, d: Detected, isLocal: (bin: string) => boolean = () => false): Rewrite {
  const parts = splitLine(command)
  const changes: { from: string; to: string }[] = []
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part // a separator
    const lead = part.match(/^\s*/)![0]
    const body = part.slice(lead.length)
    const trail = body.match(/\s*$/)![0]
    const text = body.slice(0, body.length - trail.length)
    const words = text.split(/\s+/)
    if (!MANAGERS.has(words[0] ?? '')) return part
    // Already the project's manager: nothing to do.
    if (TOOL_PM[words[0]!] === d.pm) return part
    // Anything quoted or shell-special stays exactly as written.
    if (/['"`$(){}<>\\&]/.test(text) || /(^|\s)#/.test(text)) return part
    let op = parse(words)
    if (!op) return part
    if (op.kind === 'dlx') {
      // npx's own -y comes before the tool; after it, it belongs to the tool.
      const rest = [...op.rest]
      while (rest[0] && YES.has(rest[0])) rest.shift()
      // Any other flag before the tool (--no-install, -p…) has no equivalent: left as written.
      if (!rest[0] || rest[0].startsWith('-')) return part
      const runsLocal = words[0] === 'npx' || words[0] === 'bunx' || (words[0] === 'bun' && words[1] === 'x')
      op = runsLocal && isLocal(rest[0]) ? { kind: 'exec', rest } : { kind: 'dlx', rest }
    }
    const next = render(op, d)
    if (next === text) return part
    changes.push({ from: text, to: next })
    return lead + next + trail
  })
  return { command: changes.length ? out.join('') : command, changes }
}

/** The folder a command runs in, when it starts with `cd <dir> &&`. */
export function leadingCd(command: string): string | null {
  const m = /^\s*cd\s+([^\s;&|'"`$]+)\s*&&/.exec(command)
  return m ? m[1]! : null
}

/**
 * The folder a `cd <dir>` leads to, from the session's folder, with `.` and
 * `..` resolved; null when it can't be placed (`~`, `-`).
 */
export function resolveDir(cwd: string, dir: string): string | null {
  if (dir === '-' || dir.startsWith('~')) return null
  const out: string[] = []
  for (const seg of (dir.startsWith('/') ? dir : `${cwd}/${dir}`).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `/${out.join('/')}`
}
