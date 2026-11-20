import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fmtPct, labelOf, mergeReadings, paceOf } from '../hooks/usage'

const NOW = Date.parse('2026-11-17T12:00:00Z')

test('pace and budget for a weekly window', () => {
  // Started 2 days ago, resets in 5 days, 40% used.
  const resetsAt = new Date(NOW + 5 * 86_400_000).toISOString()
  const p = paceOf({ kind: 'seven_day', percentUsed: 40, resetsAt }, NOW)
  expect(Math.round(p.expected ?? -1)).toBe(29) // 2/7 of the week
  expect(Math.round(p.delta ?? 0)).toBe(11)
  expect(p.perDay?.toFixed(0)).toBe('12') // 60% over 5 days
  expect(p.runsOutAt).not.toBeNull() // 20%/day would run out before the reset
})

test('a 5-hour window budgets per hour, not per day', () => {
  const resetsAt = new Date(NOW + 2 * 3_600_000).toISOString()
  const p = paceOf({ kind: 'five_hour', percentUsed: 30, resetsAt }, NOW)
  expect(p.perDay).toBeNull()
  expect(p.perHour?.toFixed(0)).toBe('35')
})

test('labels', () => {
  expect(labelOf('five_hour')).toBe('5h')
  expect(labelOf('seven_day')).toBe('Week')
  expect(labelOf('seven_day_fable')).toBe('Fable week')
})

const engine = (on: On, limits: { kind: string; percentUsed: number; resetsAt?: string }[]) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'limits' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: limits } }))
}

test('the band and the pane draw every window, on the terminal and desktop', async ($, on) => {
  engine(on, [
    { kind: 'five_hour', percentUsed: 34, resetsAt: new Date(NOW + 2 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 40, resetsAt: new Date(NOW + 5 * 86_400_000).toISOString() },
    { kind: 'seven_day_fable', percentUsed: 12, resetsAt: new Date(NOW + 5 * 86_400_000).toISOString() },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'limits', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({
      plugin: 'usage-bar',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /Fable week/ })).toBeDefined()
    expect(JSON.stringify(await band.drawn())).toContain('under pace')
    if (surface === 'terminal') expect(await band.find({ type: 'Text', text: /┃/ })).toBeDefined()
    else expect(await band.find({ type: 'Svg' })).toBeDefined()
    await band.unmount()

    const pane = await $.ui.mount({
      plugin: 'usage-bar',
      component: 'Pane',
      requestId: 'usage-bar',
      surface,
      props: { title: 'Usage', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    })
    expect(await pane.find({ type: 'Text', text: /per day to last/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /per hour to last/ })).toBeDefined()
    await pane.unmount()
  }
})

test('no windows, no band', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const text = (await $.command.run({ command: 'limits', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text
  expect(text).toContain('No usage windows')
})

test('after a reload, the stored readings show until the next reply, unless their windows reset', async ($, on) => {
  const kept: Record<string, unknown> = {
    'reading:me': {
      at: NOW - 60_000,
      list: [
        { kind: 'five_hour', percentUsed: 85, resetsAt: new Date(NOW + 3_600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 78, resetsAt: new Date(NOW - 1000).toISOString() },
      ],
    },
  }
  sharedStore(on, kept, 'me')
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('85%')
  expect(drawn).not.toContain('78%')
  await band.unmount()
})

// --- freshness across sessions ---

const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

test('mergeReadings: the higher reading wins for the same window and reset', () => {
  const r = iso(NOW + 2 * H)
  const out = mergeReadings(
    [
      { at: NOW - 1000, list: [{ kind: 'five_hour', percentUsed: 40, resetsAt: r }] },
      { at: NOW - 5000, list: [{ kind: 'five_hour', percentUsed: 53.6, resetsAt: r }] },
    ],
    NOW,
  )
  expect(out).toEqual([{ kind: 'five_hour', percentUsed: 53.6, resetsAt: r }])
})

test('mergeReadings: a newer reset wins over a higher reading for an older reset', () => {
  const out = mergeReadings(
    [
      { at: NOW, list: [{ kind: 'seven_day', percentUsed: 5, resetsAt: iso(NOW + 7 * 24 * H) }] },
      { at: NOW, list: [{ kind: 'seven_day', percentUsed: 90, resetsAt: iso(NOW + H) }] },
      { at: NOW, list: [{ kind: 'seven_day', percentUsed: 99 }] },
    ],
    NOW,
  )
  expect(out.map(w => w.percentUsed)).toEqual([5])
})

test('mergeReadings: a window whose reset passed is hidden; one without a reset ranks oldest but shows', () => {
  const out = mergeReadings(
    [
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 85, resetsAt: iso(NOW - 1) }] },
      { at: NOW, list: [{ kind: 'spend_limit', percentUsed: 20 }] },
    ],
    NOW,
  )
  expect(out).toEqual([{ kind: 'spend_limit', percentUsed: 20 }])
})

test('53.6% reads 54%, never 53%', () => {
  expect(fmtPct(53.6)).toBe('54%')
})

const BAND = {
  plugin: 'usage-bar',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const sharedStore = (on: On, kept: Record<string, unknown>, sid: string) => {
  on('store.get', (_, e) => ({ value: kept[e.key] }) as never)
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    delete kept[e.key]
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: Object.keys(kept) }) as never)
  on('session.id', () => ({ value: sid }) as never)
  on('command.register', () => ({ value: { command: 'limits' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('another session\'s higher reading shows on the next tick, and this session\'s is stored by its id', async ($, on) => {
  const r = iso(NOW + 2 * H)
  const kept: Record<string, unknown> = {}
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: r }] } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((kept['reading:me'] as { list: unknown[] }).list).toHaveLength(1)
  kept['reading:other'] = { at: NOW, list: [{ kind: 'five_hour', percentUsed: 53.6, resetsAt: r }] }
  await clock.advance(60_000)
  const band = await $.ui.mount(BAND)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('54%')
  expect(drawn).not.toContain('40%')
  await band.unmount()
})

test('a session that reports nothing drops a reading whose reset passed, and prunes it from the store', async ($, on) => {
  const kept: Record<string, unknown> = {
    'reading:old': { at: NOW - H, list: [{ kind: 'five_hour', percentUsed: 85, resetsAt: iso(NOW - 1000) }] },
  }
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).not.toContain('85%')
  await band.unmount()
  expect(kept['reading:old']).toBeUndefined()
})
