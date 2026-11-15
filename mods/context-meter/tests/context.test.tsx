import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compactAt, contextState } from '../hooks/context'
import type { Snapshot } from '../types'

const snap = (total: number): Snapshot => ({
  model: 'claude-opus-5-5',
  totalTokens: total,
  rawMaxTokens: 1_000_000,
  source: 'model-default',
  categories: [
    { name: 'System prompt', tokens: 20_000, kind: 'used' },
    { name: 'Messages', tokens: total - 20_000, kind: 'used' },
    { name: 'Free space', tokens: 1_000_000 - total - 170_000, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 170_000, kind: 'buffer' },
  ],
  memoryFiles: [],
  mcpServers: [],
  skills: { count: 0, tokens: 0 },
  agents: [],
  at: 0,
})

test('the compaction point and the states', () => {
  expect(compactAt(snap(100_000))?.toFixed(2)).toBe('0.83')
  expect(contextState(snap(100_000)).label).toBe('roomy')
  expect(contextState(snap(500_000)).label).toBe('filling')
  expect(contextState(snap(700_000)).label).toBe('getting full')
  expect(contextState(snap(800_000)).label).toBe('compacts soon')
})

const engine = (on: On) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  on('command.register', () => ({ value: { command: 'context-meter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 1_000_000,
        breakdown: {
          categories: [
            { name: 'System prompt', tokens: 20_000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'MCP tools', tokens: 30_000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'Messages', tokens: 350_000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 430_000, color: 'x', isDeferred: false, kind: 'free' },
            { name: 'Autocompact buffer', tokens: 170_000, color: 'x', isDeferred: false, kind: 'buffer' },
          ],
          totalTokens: 400_000,
          maxTokens: 1_000_000,
          rawMaxTokens: 1_000_000,
          autocompactSource: 'model-default',
          percentage: 40,
          gridRows: [],
          model: 'claude-opus-5-5',
          memoryFiles: [{ path: '/Users/me/project/CLAUDE.md', type: 'Project', tokens: 1200 }],
          mcpTools: [{ name: 'mcp__linear__list', serverName: 'Linear', tokens: 30_000, isLoaded: true }],
          agents: [],
        },
      },
      rateLimits: [],
    },
  }) as never)
  return clock
}

test('the band and the pane draw on the terminal and desktop', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'context-meter', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({
      plugin: 'context-meter',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    const drawn = JSON.stringify(await band.drawn())
    expect(drawn).toContain('400k of 1M')
    expect(drawn).toContain('compacts at 83%')
    await band.unmount()

    const pane = await $.ui.mount({
      plugin: 'context-meter',
      component: 'Pane',
      requestId: 'context-meter',
      surface,
      props: { title: 'Context', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    })
    const p = JSON.stringify(await pane.drawn())
    expect(p).toContain('What fills it')
    expect(p).toContain('Messages')
    await pane.press({ key: 'toggle:mcp' })
    expect(JSON.stringify(await pane.drawn())).toContain('Linear')
    await pane.press({ key: 'toggle:mcp' })
    expect(await pane.find({ key: 'compact' })).toBeDefined()
    await pane.unmount()
  }
})

const MSG = { role: 'user', text: 'hello', toolUses: [] }

const cmd = (args: string) =>
  ({ command: 'context-meter', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const

test('the style reaches /compact and Claude Code’s own compaction', async ($, on) => {
  engine(on)
  const seen: (string | undefined)[] = []
  on('session.compact', (_, e) => {
    seen.push(e.instructions)
    return { messages: e.messages }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd('style handoff'))

  await $.session.compact({ trigger: 'manual', instructions: 'Keep the API decision', messages: [MSG] } as never)
  await $.session.compact({ trigger: 'auto', messages: [MSG] } as never)
  expect(seen[0]).toContain('Keep the API decision')
  expect(seen[0]).toContain('handoff')
  expect(seen[1]).toContain('handoff')
})

test('past the threshold, auto mode compacts on its own', async ($, on) => {
  const clock = engine(on)
  const triggers: string[] = []
  on('session.compact', (_, e) => {
    triggers.push(e.trigger)
    return { messages: [MSG] as never }
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd('auto 30'))
  await $.command.run(cmd('compact'))

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 10, isAborted: false, reason: 'end_turn' } as never)
  await clock.advance(2000)
  expect(triggers.length).toBe(1)
})
