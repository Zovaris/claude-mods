import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fmtPct, hasReset, mergeReadings } from '../hooks/usage'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

test('merge: a reset 20s newer with a lower reading beats an older reset with a higher one', () => {
  const older = iso(NOW + 2 * H + 10_000)
  const newer = iso(NOW + 2 * H + 30_000)
  const out = mergeReadings(
    [
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 90, resetsAt: older }] },
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 3, resetsAt: newer }] },
    ],
    NOW,
  )
  expect(out.map(w => w.percentUsed)).toEqual([3])
})

test('merge: same instant in different ISO spellings counts as the same reset, higher wins', () => {
  const out = mergeReadings(
    [
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-11-17T14:00:00Z' }] },
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 30, resetsAt: '2026-11-17T16:00:00+02:00' }] },
    ],
    NOW,
  )
  expect(out.map(w => w.percentUsed)).toEqual([30])
})

test('merge: order of readings does not change the result', () => {
  const a = { at: 1, list: [{ kind: 'five_hour', percentUsed: 10, resetsAt: iso(NOW + H) }] }
  const b = { at: 2, list: [{ kind: 'five_hour', percentUsed: 70, resetsAt: iso(NOW + H) }] }
  const c = { at: 3, list: [{ kind: 'five_hour', percentUsed: 5, resetsAt: iso(NOW + 6 * H) }] }
  const perms = [[a, b, c], [c, b, a], [b, a, c], [b, c, a]]
  for (const p of perms) expect(mergeReadings(p, NOW).map(w => w.percentUsed)).toEqual([5])
})

test('merge: a window with no reset never beats one with a reset, in either order', () => {
  const withReset = { kind: 'seven_day', percentUsed: 1, resetsAt: iso(NOW + 24 * H) }
  const without = { kind: 'seven_day', percentUsed: 99 }
  expect(mergeReadings([{ at: 0, list: [without] }, { at: 0, list: [withReset] }], NOW)).toEqual([withReset])
  expect(mergeReadings([{ at: 0, list: [withReset] }, { at: 0, list: [without] }], NOW)).toEqual([withReset])
})

test('merge: reset exactly at now is passed and hidden; one millisecond ahead shows', () => {
  expect(mergeReadings([{ at: 0, list: [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW) }] }], NOW)).toEqual([])
  expect(hasReset({ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW) }, NOW)).toBe(true)
  expect(mergeReadings([{ at: 0, list: [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW + 1) }] }], NOW)).toHaveLength(1)
})

test('merge: a passed window is skipped, a lower live reading of the same kind shows instead', () => {
  const live = { kind: 'five_hour', percentUsed: 12, resetsAt: iso(NOW + H) }
  const out = mergeReadings(
    [
      { at: 0, list: [{ kind: 'five_hour', percentUsed: 99, resetsAt: iso(NOW - H) }] },
      { at: 0, list: [live] },
    ],
    NOW,
  )
  expect(out).toEqual([live])
})

test('merge: kinds are independent and sorted 5h, week, model, other', () => {
  const r = iso(NOW + H)
  const out = mergeReadings(
    [
      { at: 0, list: [{ kind: 'spend_limit', percentUsed: 1, resetsAt: r }, { kind: 'seven_day_fable', percentUsed: 2, resetsAt: r }] },
      { at: 0, list: [{ kind: 'seven_day', percentUsed: 3, resetsAt: r }, { kind: 'five_hour', percentUsed: 4, resetsAt: r }] },
    ],
    NOW,
  )
  expect(out.map(w => w.kind)).toEqual(['five_hour', 'seven_day', 'seven_day_fable', 'spend_limit'])
})

test('merge: empty input, empty lists, malformed entries do not throw', () => {
  expect(mergeReadings([], NOW)).toEqual([])
  expect(mergeReadings([{ at: 0, list: [] }], NOW)).toEqual([])
  const bad = [null, undefined, { at: 0 }, { at: 0, list: null }, { at: 0, list: [null, { kind: 5 }, { kind: 'x' }] }] as never
  expect(mergeReadings(bad, NOW)).toEqual([])
})

test('merge: does not mutate its inputs', () => {
  const r = iso(NOW + H)
  const input = [{ at: 0, list: [{ kind: 'seven_day', percentUsed: 1, resetsAt: r }, { kind: 'five_hour', percentUsed: 2, resetsAt: r }] }]
  const copy = JSON.parse(JSON.stringify(input))
  mergeReadings(input, NOW)
  expect(input).toEqual(copy)
})

test('merge: NaN percent never shows over a real reading, and an unparsable reset still shows its percent', () => {
  const r = iso(NOW + H)
  const out = mergeReadings(
    [
      { at: 0, list: [{ kind: 'five_hour', percentUsed: NaN, resetsAt: r }] },
      { at: 0, list: [{ kind: 'five_hour', percentUsed: 7, resetsAt: r }] },
    ],
    NOW,
  )
  expect(out.map(w => w.percentUsed)).toEqual([7])
  const bogus = mergeReadings([{ at: 0, list: [{ kind: 'five_hour', percentUsed: 7, resetsAt: 'not a date' }] }], NOW)
  expect(bogus.map(w => w.percentUsed)).toEqual([7])
})

test('fmtPct: never rounds down a fractional reading, and never prints a rounding artefact', () => {
  expect(fmtPct(53.6)).toBe('54%')
  expect(fmtPct(53.5)).toBe('54%')
  expect(fmtPct(0)).toBe('0%')
  expect(fmtPct(100)).toBe('100%')
  expect(fmtPct(9.96)).toBe('10%')
  expect(fmtPct(99.95)).not.toBe('99%')
})

// --- plugin level ---

const BAND = {
  plugin: 'usage-bar',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const sharedStore = (on: On, kept: Record<string, unknown>, sid: string | undefined) => {
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
const usage = (on: On, rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]) =>
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits } }))
const start = ($: any) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

test('plugin: malformed stored readings do not break the refresh', async ($, on) => {
  const r = iso(NOW + H)
  const kept: Record<string, unknown> = {
    'reading:a': null,
    'reading:b': 'junk',
    'reading:c': { at: 1 },
    'reading:d': { at: 1, list: [null, { kind: 'five_hour' }] },
    'reading:ok': { at: 1, list: [{ kind: 'five_hour', percentUsed: 61, resetsAt: r }] },
  }
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [])
  await start($)
  await clock.settle()
  const band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).toContain('61%')
  await band.unmount()
})

test('plugin: a reading with one passed and one live window keeps the live one and hides the passed one', async ($, on) => {
  const kept: Record<string, unknown> = {
    'reading:o': {
      at: 1,
      list: [
        { kind: 'five_hour', percentUsed: 77, resetsAt: iso(NOW - 5) },
        { kind: 'seven_day', percentUsed: 33, resetsAt: iso(NOW + 24 * H) },
      ],
    },
  }
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [])
  await start($)
  await clock.settle()
  const band = await $.ui.mount(BAND)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('33%')
  expect(drawn).not.toContain('77%')
  await band.unmount()
  expect(kept['reading:o']).toBeDefined()
})

test('plugin: this session\'s own old reading vanishes from the band once its reset passes, with no new reading', async ($, on) => {
  const kept: Record<string, unknown> = {}
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [{ kind: 'five_hour', percentUsed: 85, resetsAt: iso(NOW + H) }])
  await start($)
  await clock.settle()
  let band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).toContain('85%')
  await band.unmount()
  await clock.advance(H + 120_000)
  band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).not.toContain('85%')
  await band.unmount()
})

test('plugin: a newer reset from another session replaces this session\'s higher, older-reset reading', async ($, on) => {
  const kept: Record<string, unknown> = {}
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [{ kind: 'five_hour', percentUsed: 95, resetsAt: iso(NOW + H) }])
  await start($)
  await clock.settle()
  kept['reading:other'] = { at: NOW, list: [{ kind: 'five_hour', percentUsed: 4, resetsAt: iso(NOW + 5 * H) }] }
  await clock.advance(60_000)
  const band = await $.ui.mount(BAND)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('4%')
  expect(drawn).not.toContain('95%')
  await band.unmount()
})

test('plugin: no session id still shows the reading and does not write a bare key', async ($, on) => {
  const kept: Record<string, unknown> = {}
  sharedStore(on, kept, undefined)
  const clock = mock.clock(on, { now: NOW })
  usage(on, [{ kind: 'five_hour', percentUsed: 41, resetsAt: iso(NOW + H) }])
  await start($)
  await clock.settle()
  const band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).toContain('41%')
  await band.unmount()
  expect(Object.keys(kept).filter(k => k.startsWith('reading:undefined') || k === 'reading:')).toEqual([])
})

test('plugin: unrelated store keys are never read as readings or deleted', async ($, on) => {
  const kept: Record<string, unknown> = {
    marks: {},
    readingX: { at: 1, list: [{ kind: 'five_hour', percentUsed: 99, resetsAt: iso(NOW - 1) }] },
    keepme: 'x',
  }
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [{ kind: 'five_hour', percentUsed: 10, resetsAt: iso(NOW + H) }])
  await start($)
  await clock.settle()
  expect(kept.keepme).toBe('x')
  expect(kept.readingX).toBeDefined()
})

test('merge: resets 20s apart inside one minute still rank by time, newer wins', () => {
  const out = mergeReadings(
    [
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 90, resetsAt: iso(NOW + 2 * H + 5_000) }] },
      { at: NOW, list: [{ kind: 'five_hour', percentUsed: 3, resetsAt: iso(NOW + 2 * H + 25_000) }] },
    ],
    NOW,
  )
  expect(out.map(w => w.percentUsed)).toEqual([3])
})

test('plugin: a stored reading whose list holds a null entry does not break the refresh', async ($, on) => {
  const kept: Record<string, unknown> = {
    'reading:bad': { at: 1, list: [null] },
    'reading:ok': { at: 1, list: [{ kind: 'five_hour', percentUsed: 61, resetsAt: iso(NOW + H) }] },
  }
  sharedStore(on, kept, 'me')
  const clock = mock.clock(on, { now: NOW })
  usage(on, [])
  await start($)
  await clock.settle()
  const band = await $.ui.mount(BAND)
  expect(JSON.stringify(await band.drawn())).toContain('61%')
  await band.unmount()
})
