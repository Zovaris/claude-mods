import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compareVersions, isNewer, kindOf } from '../hooks/catalog'
import type { Entry } from '../types'

test('versions and kinds', () => {
  expect(compareVersions('0.4.1', '0.4.0') > 0).toBe(true)
  expect(compareVersions('0.10.0', '0.9.9') > 0).toBe(true)
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  expect(kindOf({ category: 'theme', hasModules: true })).toBe('theme')
  expect(kindOf({ hasModules: true })).toBe('mod')
  expect(kindOf({ hasModules: false })).toBe('plugin')
})

test('a prerelease comes before its release, and build metadata or a v prefix changes nothing', () => {
  expect(compareVersions('1.0.0', '1.0.0-beta.1') > 0).toBe(true)
  expect(compareVersions('1.0.0-beta.1', '1.0.0') < 0).toBe(true)
  expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1') > 0).toBe(true)
  expect(compareVersions('1.0.0-beta.11', '1.0.0-beta.2') > 0).toBe(true)
  expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.9') > 0).toBe(true)
  expect(compareVersions('1.0.1-beta.1', '1.0.0') > 0).toBe(true)
  expect(compareVersions('1.0.0+abc', '1.0.0')).toBe(0)
  expect(compareVersions('v1.2.0', '1.1.9') > 0).toBe(true)
  const e = (version: string, latest: string) => ({ installed: true, version, latest }) as Entry
  expect(isNewer(e('1.0.0', '1.0.0-beta.1'))).toBe(false)
  expect(isNewer(e('1.0.0-beta.1', '1.0.0'))).toBe(true)
})

test('versions that are not semver (a commit hash) are never called newer', () => {
  expect(compareVersions('a1b2c3d', 'f9e8d7c')).toBe(0)
  expect(compareVersions('1.2.0', 'a1b2c3d')).toBe(0)
})

const H = '/home/me'
const MK = `${H}/.claude/plugins/marketplaces/claude-mods`
const FILES: Record<string, unknown> = {
  [`${H}/.claude/plugins/installed_plugins.json`]: {
    plugins: {
      'usage-bar@claude-mods': [{ scope: 'user', installPath: `${H}/cache/usage-bar/0.4.0`, version: '0.4.0' }],
      'nebula@claude-mods': [{ scope: 'user', installPath: `${H}/cache/nebula/0.2.0`, version: '0.2.0' }],
      'dunes@claude-mods': [{ scope: 'user', installPath: `${H}/cache/dunes/0.1.0`, version: '0.1.0' }],
    },
  },
  [`${H}/.claude/settings.json`]: { enabledPlugins: { 'usage-bar@claude-mods': true, 'nebula@claude-mods': false, 'dunes@claude-mods': true } },
  [`${H}/.claude/plugins/known_marketplaces.json`]: { 'claude-mods': { installLocation: MK } },
  [`${MK}/.claude-plugin/marketplace.json`]: {
    plugins: [
      { name: 'usage-bar', source: './mods/usage-bar', category: 'productivity' },
      { name: 'nebula', source: './themes/nebula', category: 'theme' },
      { name: 'dunes', source: './themes/dunes', category: 'theme' },
      { name: 'context-meter', source: './mods/context-meter', category: 'productivity', description: 'What fills the window' },
    ],
  },
  [`${MK}/mods/usage-bar/.claude-plugin/plugin.json`]: { version: '0.5.0' },
  [`${MK}/mods/usage-bar/hooks/hooks.json`]: { modules: ['./register.tsx'] },
  [`${MK}/themes/nebula/.claude-plugin/plugin.json`]: { version: '0.2.0' },
  [`${MK}/themes/dunes/.claude-plugin/plugin.json`]: { version: '0.1.0' },
  [`${H}/cache/dunes/0.1.0/.claude-plugin/plugin.json`]: { version: '0.1.0', description: 'A red desert' },
  [`${MK}/mods/context-meter/.claude-plugin/plugin.json`]: { version: '0.1.0' },
  [`${MK}/mods/context-meter/hooks/hooks.json`]: { modules: ['./register.tsx'] },
  [`${H}/cache/usage-bar/0.4.0/.claude-plugin/plugin.json`]: { version: '0.4.0', description: 'Usage windows' },
  [`${H}/cache/usage-bar/0.4.0/hooks/hooks.json`]: { modules: ['./register.tsx'] },
  [`${H}/cache/nebula/0.2.0/.claude-plugin/plugin.json`]: { version: '0.2.0', description: 'A space look' },
}

const engine = (on: On, ran: string[][], env: Record<string, string> = { HOME: H }, exitCode = 0) => {
  mock.store(on)
  on('env.get', (_, e) => ({ value: env[e.name] }) as never)
  on('fs.read', (_, e) => {
    const f = FILES[e.path]
    if (f === undefined) throw new Error('ENOENT')
    return { value: JSON.stringify(f) } as never
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === '/bin/sh') return { value: { exitCode: 0, stdout: '/usr/local/bin/claude\n', stderr: '' } } as never
    return { value: { exitCode, stdout: exitCode === 0 ? '✔ Done\n' : '', stderr: exitCode === 0 ? '' : 'boom\n' } } as never
  })
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

const PANE = {
  plugin: 'mod-manager',
  component: 'Pane',
  requestId: 'mod-manager',
  props: { title: 'Mods', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
} as const

test('lists mods, themes and what is available, and updates through the claude command', async ($, on) => {
  const ran: string[][] = []
  engine(on, ran)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('3 installed')
    expect(drawn).toContain('1 update')
    expect(drawn).toContain('Themes')
    expect(await ui.find({ key: 'update:usage-bar@claude-mods' })).toBeDefined()
    expect(await ui.find({ key: 'switch:nebula@claude-mods' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update:usage-bar@claude-mods' })
  expect(ran.some(a => a.join(' ') === '/usr/local/bin/claude plugin update usage-bar@claude-mods')).toBe(true)
  expect(await ui.find({ key: 'reload' })).toBeDefined()
  await ui.unmount()
})

test('turning a theme on turns the other themes off first', async ($, on) => {
  const ran: string[][] = []
  engine(on, ran)
  const themed: string[] = []
  on('command.run', { command: 'nebula' }, (_, e) => {
    themed.push(e.args)
    return { text: 'Nebula is on.' }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'switch:nebula@claude-mods' })
  const cmds = ran.filter(a => a[1] === 'plugin').map(a => a.slice(1).join(' '))
  expect(cmds).toEqual(['plugin disable dunes@claude-mods', 'plugin enable nebula@claude-mods'])
  // Switched live too, through the theme's own command.
  expect(themed).toEqual(['on'])
  expect(JSON.stringify(await ui.drawn())).toContain('nebula is on.')
  await ui.unmount()
})

test('where the session cannot reload plugins, the pane says when changes load', async ($, on) => {
  const ran: string[][] = []
  engine(on, ran)
  on('command.run', { command: 'reload-plugins' }, () => ({ text: "/reload-plugins isn't available over a remote connection in this session." }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update:usage-bar@claude-mods' })
  await ui.press({ key: 'reload' })
  expect(JSON.stringify(await ui.drawn())).toContain('changes load in your next session')
  await ui.press({ key: 'update:usage-bar@claude-mods' })
  expect(await ui.find({ key: 'reload' })).toBeUndefined()
  await ui.unmount()
})

const open = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  return $.ui.mount({ ...PANE, surface: 'desktop' })
}

test('checking marketplaces for updates changes nothing that needs a reload', async ($, on) => {
  const ran: string[][] = []
  engine(on, ran)
  const ui = await open($)
  await ui.press({ key: 'check' })
  expect(ran.some(a => a.join(' ') === '/usr/local/bin/claude plugin marketplace update claude-mods')).toBe(true)
  expect(await ui.find({ key: 'reload' })).toBeUndefined()
  await ui.unmount()
})

test('an empty CLAUDE_CONFIG_DIR falls back to ~/.claude', async ($, on) => {
  engine(on, [], { HOME: H, CLAUDE_CONFIG_DIR: '' })
  const ui = await open($)
  expect(JSON.stringify(await ui.drawn())).toContain('3 installed')
  await ui.unmount()
})

test('a failing claude command shows why and offers no reload', async ($, on) => {
  engine(on, [], { HOME: H }, 1)
  const ui = await open($)
  await ui.press({ key: 'update:usage-bar@claude-mods' })
  expect(JSON.stringify(await ui.drawn())).toContain('Failed: boom')
  expect(await ui.find({ key: 'reload' })).toBeUndefined()
  await ui.unmount()
})
