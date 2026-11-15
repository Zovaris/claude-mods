import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'tool-toggle',
  component: 'Pane',
  requestId: 'tool-toggle',
  props: {
    title: 'Tools',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const G = 'c0ffee00-gmail'
const TOOLS = [
  { name: 'Bash', description: 'shell', mcp: false },
  { name: `mcp__${G}__send_message`, description: 'send', mcp: true },
  { name: `mcp__${G}__get_thread`, description: 'read', mcp: true },
  { name: 'mcp__ccd_view__show_pane', description: 'pane', mcp: true },
]

const engine = (on: On, sets: { connector: unknown; enabled: unknown }[]) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.list', () => ({ value: TOOLS }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    if (e.tool === 'mcp__ccd_connectors__session_connectors_status') {
      const servers = [
        { name: 'Gmail', id: G, kind: 'connector', status: 'connected', tool_count: 2 },
        { name: 'Slack', id: 'abc', kind: 'connector', status: 'disabled' },
      ]
      return { result: {}, text: JSON.stringify({ servers }) }
    }
    if (e.tool === 'mcp__ccd_connectors__set_session_connector_enabled') {
      const args = e as unknown as { connector: unknown; enabled: unknown }
      sets.push({ connector: args.connector, enabled: args.enabled })
    }
    return { result: {} }
  })
}

const run = (args: string) => ({
  command: 'tools',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
}) as const

test('turning Gmail off by name blocks its tools and switches the connector', async ($, on) => {
  const sets: { connector: unknown; enabled: unknown }[] = []
  engine(on, sets)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run(run('off gmail'))).text).toBe('Gmail: off')
  expect(sets).toEqual([{ connector: G, enabled: false }])
  expect((await $.tool.call({ tool: `mcp__${G}__get_thread` } as never)).deny).toContain('tool-toggle')
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeUndefined()

  await $.command.run(run('on gmail'))
  expect((await $.tool.call({ tool: `mcp__${G}__get_thread` } as never)).deny).toBeUndefined()
})

test('the pane shows connectors by name and toggles them, on every surface', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(run(''))
  await $.command.run(run('list'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: `exp:${G}` })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Slack' })).toBeDefined()
    await ui.press({ key: `srv:${G}` })
    expect((await ui.find({ type: 'Text', text: /connectors on/ }))?.text).toContain('0 of 2')
    await ui.press({ key: 'all-on' })
    await ui.unmount()
  }
})

test('a skill turned off leaves the listing, the Skill tool and its own prompt', async ($, on) => {
  engine(on, [])
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 1_000_000,
        breakdown: { skills: { totalSkills: 2, includedSkills: 2, tokens: 10, skillFrontmatter: [
          { name: 'commit', source: 'userSettings', tokens: 5 },
          { name: 'animate', source: 'plugin', pluginName: 'motion', tokens: 5 },
        ] } } as never,
      },
      rateLimits: [],
    },
  }))
  on('skill.prompt', (_, e) => ({ text: `the ${e.skill} skill` }))
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run(run('off commit'))).text).toBe('Skill commit: off')
  expect((await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)).deny).toContain('commit')
  expect((await $.tool.call({ tool: 'Skill', skill: 'animate' } as never)).deny).toBeUndefined()
  expect((await $.skill.prompt({ skill: 'commit', text: 'x' } as never)).text).toContain('turned off')

  const listing = '- animate: Build an animation\n- commit: Commits the changes\n  in small steps\nTail line'
  const shown = await $.prompt.attachment({ type: 'skill_listing', text: listing, origin: { kind: 'engine' } } as never)
  expect(shown.text).toBe('- animate: Build an animation\nTail line')

  await $.command.run(run('on commit'))
  expect((await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)).deny).toBeUndefined()
})
