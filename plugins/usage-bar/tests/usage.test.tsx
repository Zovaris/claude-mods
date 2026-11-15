import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { labelOf, paceOf } from '../hooks/usage'

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
    expect(await band.find({ type: 'Text', text: /under pace/ })).toBeDefined()
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
