import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { detectIn, leadingCd, rewrite } from '../hooks/pm'

const files = (...names: string[]) => new Set(names)

test('detection: packageManager field, then the lockfile, else nothing', () => {
  expect(detectIn(files('package.json', 'bun.lock'))?.pm).toBe('bun')
  expect(detectIn(files('bun.lockb'))?.pm).toBe('bun')
  expect(detectIn(files('pnpm-lock.yaml'))?.pm).toBe('pnpm')
  expect(detectIn(files('yarn.lock'))).toEqual({ pm: 'yarn', why: 'yarn.lock', yarnBerry: false })
  expect(detectIn(files('yarn.lock', '.yarnrc.yml'))?.yarnBerry).toBe(true)
  expect(detectIn(files('package.json', 'package-lock.json'), 'pnpm@9.1.0')?.pm).toBe('pnpm')
  expect(detectIn(files('package.json'))).toBeNull()
  expect(detectIn(files('go.mod', 'Cargo.toml'))).toBeNull()
})

test('rewrites for bun, and leaves alone what it should', () => {
  const bun = detectIn(files('bun.lock'))!
  const r = (c: string) => rewrite(c, bun, b => b === 'tsc').command
  expect(r('npm install')).toBe('bun install')
  expect(r('npm i -D vitest')).toBe('bun add -d vitest')
  expect(r('npm ci')).toBe('bun install --frozen-lockfile')
  expect(r('npm test')).toBe('bun run test')
  expect(r('npx tsc --noEmit')).toBe('bunx tsc --noEmit')
  expect(r('cd web && npm install && npm run dev')).toBe('cd web && bun install && bun run dev')
  // Left alone: global installs, flags with no equivalent, quoted text, unknown commands, bun's own runner.
  for (const same of ['npm install -g vercel', 'npm i --legacy-peer-deps', 'echo "npm install"', 'npm init -y', 'npm publish', 'bun test', 'bun install']) {
    expect(r(same)).toBe(same)
  }
})

test('npx uses the project\'s own tool when it has one, else downloads it', () => {
  const pnpm = detectIn(files('pnpm-lock.yaml'))!
  expect(rewrite('npx tsc', pnpm, b => b === 'tsc').command).toBe('pnpm exec tsc')
  expect(rewrite('npx -y create-vite@latest app', pnpm).command).toBe('pnpm dlx create-vite@latest app')
  const npm = detectIn(files('package-lock.json'))!
  expect(rewrite('npx tsc', npm).changes).toEqual([])
  expect(rewrite('bun add zod', npm).command).toBe('npm install zod')
})

test('the folder a command runs in', () => {
  expect(leadingCd('cd apps/web && npm i')).toBe('apps/web')
  expect(leadingCd('npm i')).toBeNull()
})

// ---- the mod in the engine --------------------------------------------------

const TREE: Record<string, string[]> = {
  '/code/app': ['package.json', 'bun.lock', '.git', 'node_modules'],
  '/code/app/node_modules/.bin': ['tsc'],
  '/code/svc': ['go.mod', 'main.go', '.git'],
}

const engine = (on: On, cwd: string, ran: string[]) => {
  mock.store(on)
  mock.clock(on, { now: 1_800_000_000_000 })
  on('command.register', () => ({ value: { command: 'pm' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }) as never)
  on('fs.list', (_, e) => ({ value: (TREE[e.path] ?? []).map(name => ({ name, kind: 'file' })) }) as never)
  on('fs.read', (_, e) => {
    if (e.path === '/code/app/package.json') return { value: '{"name":"app"}' } as never
    throw new Error('ENOENT')
  })
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    ran.push(String(e.command))
    return { result: { stdout: 'ok', stderr: '', interrupted: false } } as never
  })
  on('prompt.compose', () => ({ sections: [] }))
}

const bash = (command: string) => ({ tool: 'Bash', command, tool_use_id: 'toolu_1' }) as never
const compose = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: ['Bash'], outputStyle: null, traits: [] } as never
const pm = (args: string) => ({ command: 'pm', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const

test('in a bun project: npm runs as bun, the model is told, and /pm off stops it here', async ($, on) => {
  const ran: string[] = []
  engine(on, '/code/app', ran)
  await $.session.start({ cwd: '/code/app', surface: 'desktop', isInteractive: true })

  const r = await $.tool.call(bash('npm install && npx tsc --noEmit'))
  expect(ran[0]).toBe('bun install && bunx tsc --noEmit')
  expect(JSON.stringify(r)).toContain('this project uses bun (bun.lock)')

  const prompt = await $.prompt.compose(compose)
  expect(JSON.stringify(prompt)).toContain("This project's package manager is bun")

  expect((await $.command.run(pm(''))).text).toContain('bun, from bun.lock')
  await $.command.run(pm('off'))
  await $.tool.call(bash('npm install'))
  expect(ran[1]).toBe('npm install')
  expect(JSON.stringify(await $.prompt.compose(compose))).not.toContain('package manager is')
  await $.command.run(pm('on'))
  await $.tool.call(bash('npm install'))
  expect(ran[2]).toBe('bun install')
})

test('in a Go project it does nothing at all', async ($, on) => {
  const ran: string[] = []
  engine(on, '/code/svc', ran)
  await $.session.start({ cwd: '/code/svc', surface: 'desktop', isInteractive: true })
  await $.tool.call(bash('npm install'))
  expect(ran[0]).toBe('npm install')
  expect(JSON.stringify(await $.prompt.compose(compose))).not.toContain('package manager')
  expect((await $.command.run(pm(''))).text).toContain('nothing to do')
})
