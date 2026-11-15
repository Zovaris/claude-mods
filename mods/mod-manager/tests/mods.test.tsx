import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compareVersions, kindOf } from '../hooks/catalog'

test('versions and kinds', () => {
  expect(compareVersions('0.4.1', '0.4.0') > 0).toBe(true)
  expect(compareVersions('0.10.0', '0.9.9') > 0).toBe(true)
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  expect(kindOf({ category: 'theme', hasModules: true })).toBe('theme')
  expect(kindOf({ hasModules: true })).toBe('mod')
  expect(kindOf({ hasModules: false })).toBe('plugin')
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

const engine = (on: On, ran: string[][]) => {
  mock.store(on)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? H : undefined }) as never)
  on('fs.read', (_, e) => {
    const f = FILES[e.path]
    if (f === undefined) throw new Error('ENOENT')
    return { value: JSON.stringify(f) } as never
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === '/bin/sh') return { value: { exitCode: 0, stdout: '/usr/local/bin/claude\n', stderr: '' } } as never
    return { value: { exitCode: 0, stdout: '✔ Done\n', stderr: '' } } as never
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
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'switch:nebula@claude-mods' })
  const cmds = ran.filter(a => a[1] === 'plugin').map(a => a.slice(1).join(' '))
  expect(cmds).toEqual(['plugin disable dunes@claude-mods', 'plugin enable nebula@claude-mods'])
  await ui.unmount()
})
