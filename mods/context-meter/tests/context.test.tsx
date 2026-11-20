import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { compactAt, contextState, DEFAULT_AUTO, fillOf, isDue, partsOf } from '../hooks/context'
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

type Used = { total: number; tokens?: number; window?: number; calls?: number }

const engine = (on: On, used: Used = { total: 400_000 }) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  on('command.register', () => ({ value: { command: 'context-meter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => {
    used.calls = (used.calls ?? 0) + 1
    return {
    value: {
      startedAt: 0,
      context: {
        window: used.window ?? 1_000_000,
        tokens: used.tokens,
        breakdown: {
          categories: [
            { name: 'System prompt', tokens: 20_000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'MCP tools', tokens: 30_000, color: 'x', isDeferred: false, kind: 'used' },
            { name: "Messages", get tokens() { return used.total - 50_000 }, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 430_000, color: 'x', isDeferred: false, kind: 'free' },
            { name: 'Autocompact buffer', tokens: 170_000, color: 'x', isDeferred: false, kind: 'buffer' },
          ],
          get totalTokens() { return used.total },
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
  } as never
  })
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

test('a compaction updates the meter even when session.compact never reaches the mod', async ($, on) => {
  const used = { total: 734_000 }
  const clock = engine(on, used)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd(''))
  const props = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  let band = await $.ui.mount({ plugin: 'context-meter', component: 'AbovePrompt', surface: 'desktop', props })
  expect(JSON.stringify(await band.drawn())).toContain('734k of 1M')
  await band.unmount()

  // /compact ran, but another plugin answered session.compact first: only the row arrives.
  used.total = 99_800
  await $.session.append({
    message: { type: 'system', content: [{ type: 'text', text: 'Conversation compacted' }] },
    door: 'compaction',
    origin: { kind: 'engine' },
    uuid: 'c1',
  } as never)
  await clock.advance(1000)
  band = await $.ui.mount({ plugin: 'context-meter', component: 'AbovePrompt', surface: 'desktop', props })
  expect(JSON.stringify(await band.drawn())).toContain('99.8k of 1M')
  await band.unmount()
})

const props = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const drawnBand = async ($: any) => {
  const band = await $.ui.mount({ plugin: 'context-meter', component: 'AbovePrompt', surface: 'desktop', props })
  const drawn = JSON.stringify(await band.drawn())
  await band.unmount()
  return drawn
}

test('the fill is the measured tokens over the measured window when there are, else the estimate', () => {
  const s = snap(400_000)
  expect(fillOf(s)).toEqual({ tokens: 400_000, window: 1_000_000 })
  const m = { ...s, measuredTokens: 450_000, window: 2_000_000 }
  expect(fillOf(m)).toEqual({ tokens: 450_000, window: 2_000_000 })
  expect(compactAt(m)?.toFixed(3)).toBe('0.415')
  expect(compactAt(s)?.toFixed(2)).toBe('0.83')
  expect(partsOf(m).at(-1)?.share).toBe(20_000 / 2_000_000)
  expect(contextState({ ...m, measuredTokens: 780_000 }).label).toBe('compacts soon')
  expect(isDue({ ...m, measuredTokens: 700_000 }, { ...DEFAULT_AUTO, threshold: 30 }, 0)).toBe(true)
  expect(isDue(s, { ...DEFAULT_AUTO, threshold: 30 }, 0)).toBe(true)
  expect(isDue({ ...m, measuredTokens: 500_000 }, { ...DEFAULT_AUTO, threshold: 30 }, 0)).toBe(false)
})

test('a NaN or missing measured figure falls back to the estimate', () => {
  const s = snap(400_000)
  expect(fillOf({ ...s, measuredTokens: Number.NaN, window: 1_000_000 })).toEqual({ tokens: 400_000, window: 1_000_000 })
  expect(fillOf({ ...s, measuredTokens: 5, window: 0 })).toEqual({ tokens: 400_000, window: 1_000_000 })
})

test('the band shows the measured total and percent of the last response', async ($, on) => {
  engine(on, { total: 400_000, tokens: 450_000, window: 1_000_000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd(''))
  const drawn = await drawnBand($)
  expect(drawn).toContain('450k of 1M')
  expect(drawn).toContain('45%')
  expect(drawn).not.toContain('400k of')
})

test('a session.measure with context changed refreshes the meter, other changes do not', async ($, on) => {
  const used: Used = { total: 400_000, tokens: 400_000 }
  const clock = engine(on, used)
  on('session.measure', (_, e) => ({ changed: e.changed }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd(''))
  expect(await drawnBand($)).toContain('400k of 1M')
  const before = used.calls ?? 0

  used.tokens = 520_000
  await $.session.measure({ context: { tokens: 520_000, window: 1_000_000 }, rateLimits: [], changed: ['cost'] } as never)
  await clock.advance(100)
  expect(used.calls).toBe(before)

  await $.session.measure({ context: { tokens: 520_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  await clock.advance(100)
  expect(await drawnBand($)).toContain('520k of 1M')
})

test('turn.step refreshes while tools run, at most once every two seconds', async ($, on) => {
  const used: Used = { total: 400_000, tokens: 400_000 }
  const clock = engine(on, used)
  on('turn.step', async function* (_, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(cmd(''))
  await clock.advance(5000)
  const before = used.calls ?? 0
  const step = async () => {
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm' } as never) as unknown as AsyncIterable<unknown>
    for await (const _ of stream);
  }
  used.tokens = 410_000
  await step()
  await step()
  await clock.advance(100)
  expect(used.calls).toBe(before + 1)
  await clock.advance(2100)
  await step()
  await clock.advance(100)
  expect(used.calls).toBe(before + 2)
})
