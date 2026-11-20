import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { accountOf, decideTtl, fmtClock, fmtTokens, observeTtl, parseDuration } from '../hooks/cache'
import { langOf, pickLang, STRINGS, tallyOf } from '../hooks/i18n'
import type { Sample } from '../types'

const T0 = 1_800_000_000_000
const MIN = 60_000
const big = (startedAt: number, over: Partial<Sample> = {}): Sample => ({
  turnId: 't1',
  model: 'claude-opus-5-5',
  startedAt,
  read: 190_000,
  write: 8_000,
  fresh: 2_000,
  output: 1_000,
  ...over,
})
const run = (args: string) =>
  ({ command: 'cache', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const
const PLAN = [{ kind: 'five_hour', percentUsed: 40, resetsAt: T0 + 3_600_000 }]
const BAND = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const usage = (read: number, write: number) => ({
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

/** A store that remembers, as the real one does across a plugin reload. */
const memory = (on: On, kept: Record<string, unknown> = {}) => {
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
  return kept
}

const base = (on: On, now: number, seeded: Sample[] = [], store = true, limits: unknown[] = []) => {
  if (store) mock.store(on)
  const clock = mock.clock(on, { now })
  on('command.register', () => ({ value: { command: 'cache' } }))
  on('ui.log', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sess-1' }) as never)
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000 }, rateLimits: limits } }) as never)
  // The seeded requests are what the session measured before; later writes win.
  let isWritten = false
  on('state.set', (_, e, next) => {
    if (e.key === 'samples') isWritten = true
    return next(e)
  })
  on('state.get', ($, e, next) =>
    e.key === 'samples' && !isWritten ? { value: { value: { shape: 'samples-1', value: seeded }, version: 1 } } : next(e),
  )
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ deny: 'dismissed' }))
  return clock
}
const start = ($: Parameters<Parameters<typeof test>[1]>[0]) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

const step = async ($: Parameters<Parameters<typeof test>[1]>[0], turnId: string) => {
  for await (const _ of $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5' } as never)) void _
}

// ---- pure ------------------------------------------------------------------

test('token counts never read as 1000k', () => {
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(1500)).toBe('1.5k')
  expect(fmtTokens(99_999)).toBe('100k')
  expect(fmtTokens(999_999)).toBe('1M')
  expect(fmtTokens(2_500_000)).toBe('2.5M')
})

test('the clock reads h:mm:ss and never goes negative', () => {
  expect(fmtClock(-5)).toBe('0:00')
  expect(fmtClock(61_000)).toBe('1:01')
  expect(fmtClock(3_661_000)).toBe('1:01:01')
})

test('durations: units combine, nothing else parses', () => {
  expect(parseDuration('1h30m')).toBe(90 * MIN)
  expect(parseDuration('2 h')).toBe(120 * MIN)
  expect(parseDuration('0m')).toBeNull()
  expect(parseDuration('')).toBeNull()
  expect(parseDuration('2')).toBeNull()
})

test('Auto follows Claude Code: option, FORCE 5m, TTL var, setting, 1h var, account', () => {
  expect(decideTtl('1h', { force5m: '1' }, undefined, 'other').ttl).toBe('1h')
  expect(decideTtl('auto', { force5m: 'true', ttlVar: '1h' }, '1h', 'subscription').ttl).toBe('5m')
  expect(decideTtl('auto', { ttlVar: '1h' }, '5m', 'other')).toEqual({ ttl: '1h', source: 'CLAUDE_CODE_PROMPT_CACHE_TTL' })
  expect(decideTtl('auto', {}, '5m', 'subscription').ttl).toBe('5m')
  expect(decideTtl('auto', { enable1h: 'TRUE' }, undefined, 'other').ttl).toBe('1h')
  expect(decideTtl('auto', {}, undefined, 'subscription').ttl).toBe('1h')
  expect(decideTtl('auto', {}, undefined, 'credits')).toEqual({ ttl: '5m', source: 'usage credits' })
  expect(decideTtl('auto', {}, undefined, 'other').ttl).toBe('5m')
})

test('an account is a subscription until its plan limits are used up', () => {
  expect(accountOf([])).toBe('other')
  expect(accountOf([{ kind: 'five_hour', percentUsed: 40 }])).toBe('subscription')
  expect(accountOf([{ kind: 'seven_day', percentUsed: 100 }])).toBe('credits')
  expect(accountOf([{ kind: 'opus_only', percentUsed: 100 }])).toBe('other')
})

test('request timing proves the lifetime', () => {
  const prev = big(T0)
  expect(observeTtl(prev, big(T0 + 3 * MIN), null)).toBeNull()
  expect(observeTtl(prev, big(T0 + 20 * MIN), null)).toBe('1h')
  expect(observeTtl(prev, big(T0 + 20 * MIN, { read: 0, write: 200_000 }), null)).toBe('5m')
  expect(observeTtl(prev, big(T0 + 20 * MIN, { read: 0, write: 200_000 }), '1h')).toBe('1h')
  expect(observeTtl(prev, big(T0 + 20 * MIN, { model: 'claude-sonnet-5-5' }), '5m')).toBe('5m')
  expect(observeTtl(undefined, big(T0), '1h')).toBe('1h')
})

test('the setting language: names, codes and locales, and not other languages that start the same', () => {
  for (const [v, l] of [['es-ES', 'es'], ['Español', 'es'], ['spanish', 'es'], ['pt-BR', 'pt'], ['Português', 'pt'], ['portuguese', 'pt'], ['fr', 'fr'], ['Français', 'fr'], ['English (US)', 'en'], ['en_GB', 'en']] as const)
    expect(langOf(v)).toBe(l)
  for (const v of ['Estonian', 'Esperanto', 'Frisian', 'Enochian', 'Polish', '', '  ', undefined, null]) expect(langOf(v)).toBeNull()
})

test('the language you write needs a clear lead, and every language has its strings', () => {
  expect(pickLang(null, { en: 2, es: 0, pt: 0, fr: 0 })).toBe('en')
  expect(pickLang(null, { en: 0, es: 3, pt: 3, fr: 0 })).toBe('en') // too close to call
  expect(pickLang(null, { en: 0, es: 3, pt: 1, fr: 0 })).toBe('es')
  expect(pickLang(null, tallyOf('je veux faire ça pour vous et nous avons une très bonne idée'))).toBe('fr')
  const plan = { kind: 'plan', times: '40', cold: '$1.60' } as const
  const api = { kind: 'api', cold: '$1.60', warm: '$0.04' } as const
  for (const l of ['en', 'es', 'pt', 'fr'] as const) {
    const t = STRINGS[l]
    expect(t.question({ tokens: '200k', ago: '4m', weight: api })).toContain('$0.04')
    expect(t.question({ tokens: '200k', ago: '4m', weight: plan })).toContain('40')
    expect(t.send(plan)).toContain('$1.60')
    expect(t.send({ kind: 'plan', times: '40' })).not.toContain('(')
    expect(t.expiring({ left: '0:50', tokens: '200k', weight: api })).toContain('0:50')
    expect(t.held.length).toBeGreaterThan(0)
  }
})

// ---- the engine ------------------------------------------------------------

test('keep-warm pings just before the cache runs out, once, and the ping renews the clock', async ($, on) => {
  const pings: string[] = []
  on('model.fork', (_, e) => {
    pings.push(e.prompt)
    return { value: { isAnswered: true, usage: usage(200_000, 100) } } as never
  })
  const clock = base(on, T0 + 1000, [big(T0)], true, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  await clock.advance(40 * MIN)
  expect(pings.length).toBe(0)
  await clock.advance(11 * MIN) // 51 min after the request: 9 minutes left, inside the 10-minute lead
  expect(pings.length).toBe(1)
  expect(pings[0]).toContain('keep-alive')
  await clock.advance(5 * MIN)
  expect(pings.length).toBe(1) // the ping renewed the cache
  expect((await $.command.run(run('status'))).text).toContain('Keeping warm')
})

test('a ping that finds the cache already cold stops keep-warm and says so', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: true, usage: usage(0, 200_000) } }) as never)
  const clock = base(on, T0 + 1000, [big(T0)], true, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  await clock.advance(52 * MIN)
  expect((await $.command.run(run('status'))).text).toContain('Keep-warm: off')
})

test('a busy API retries the ping a minute later', async ($, on) => {
  let calls = 0
  on('model.fork', () => {
    calls += 1
    return { value: calls === 1 ? { isAnswered: false, reason: 'overloaded' } : { isAnswered: true, usage: usage(200_000, 0) } } as never
  })
  const clock = base(on, T0 + 1000, [big(T0)], true, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  await clock.advance(50 * MIN)
  expect(calls).toBe(1)
  await clock.advance(30_000)
  expect(calls).toBe(1)
  await clock.advance(40_000)
  expect(calls).toBe(2)
})

test('no ping goes out while a turn is running, and none after keep-warm is off', async ($, on) => {
  let calls = 0
  on('model.fork', () => {
    calls += 1
    return { value: { isAnswered: true, usage: usage(200_000, 0) } } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  const clock = base(on, T0 + 1000, [big(T0)], true, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  await clock.advance(52 * MIN)
  expect(calls).toBe(0)
  await $.turn.complete({ turnId: 't2', answer: 'done', durationMs: 10, isAborted: false, reason: 'end_turn' } as never)
  await $.command.run(run('stop'))
  await clock.advance(MIN)
  expect(calls).toBe(0)
})

test('a keep-warm extension that ran out leaves the row without the extended chip', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: true, usage: usage(200_000, 0) } }) as never)
  const clock = base(on, T0 + 1000, [big(T0)], true, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  const band = await $.ui.mount({ plugin: 'cache-control', component: 'AbovePrompt', surface: 'desktop', props: BAND })
  expect(JSON.stringify(await band.drawn())).toContain('extended')
  await $.command.run(run('stop'))
  expect(JSON.stringify(await band.drawn())).not.toContain('extended')
  await band.unmount()
  void clock
})

test('/cache warm with nothing valid explains itself, and warm off ends it', async ($, on) => {
  base(on, T0 + 1000, [big(T0)])
  await start($)
  expect((await $.command.run(run('warm soon'))).text).toContain('Usage')
  expect((await $.command.run(run('warm 100h'))).text).toContain('12:00:00')
  expect((await $.command.run(run('warm off'))).text).toContain('stopped')
  expect((await $.command.run(run('status'))).text).toContain('Keep-warm: off')
  expect((await $.command.run(run('nonsense'))).text).toContain('Usage')
})

test('the choices made in the pane come back after a reload', async ($, on) => {
  const kept = memory(on)
  base(on, T0 + 10 * MIN, [big(T0)], false)
  await start($)
  await $.command.run(run('guard off'))
  await $.command.run(run('prices off'))
  expect(kept.guard).toBe(false)
  expect(kept.apiPrices).toBe(false)
  const pane = await $.ui.mount({
    plugin: 'cache-control',
    component: 'Pane',
    requestId: 'cache-control',
    surface: 'desktop',
    props: { title: 'Cache', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 120 }, view: {} },
  })
  await pane.press({ key: 'ttl-5m' })
  await pane.unmount()
  expect(kept.ttlChoice).toBe('5m')

  // The plugin starts again with what the first run left.
  await start($)
  expect((await $.command.run(run('status'))).text).toContain('Confirm cold sends: no')
  expect((await $.command.run(run('status'))).text).toContain('5m cache (set by hand)')
})

test('/clear forgets what was measured, on disk too, so a reload does not bring it back', async ($, on) => {
  const kept = memory(on)
  const clock = base(on, T0 + 10 * MIN, [], false)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], usage: usage(190_000, 8_000) } as never
  })
  on('session.end', () => ({ sessionId: 'sess-1' }) as never)
  await start($)
  await step($, 't1')
  expect(Array.isArray(kept['samples:sess-1'])).toBe(true)
  await $.session.end({ reason: 'clear' } as never)
  expect(kept['samples:sess-1']).toBeUndefined()
  void clock
})

test('a store that fails does not take the meter down with it', async ($, on) => {
  let calls = 0
  on('model.fork', () => {
    calls += 1
    return { value: { isAnswered: true, usage: usage(200_000, 0) } } as never
  })
  on('store.get', () => {
    throw new Error('disk full')
  })
  on('store.set', () => {
    throw new Error('disk full')
  })
  const clock = base(on, T0 + 1000, [big(T0)], false, PLAN)
  await start($)
  await $.command.run(run('warm 1h'))
  await clock.advance(52 * MIN)
  expect(calls).toBe(1) // the ticker still started
})

test('a hit after a gap the pings bridged does not prove a 1 hour cache', async ($, on) => {
  let pings = 0
  on('model.fork', () => (pings++, { value: { isAnswered: true, usage: usage(200_000, 0) } }) as never)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], usage: usage(200_000, 0) } as never
  })
  const clock = base(on, T0 + 1000)
  await start($)
  // A 5-minute cache kept warm by pings at minutes 4 and 8; a message at minute 11 finds it alive.
  await step($, 't1')
  await $.command.run(run('warm 1h'))
  await clock.advance(11 * MIN)
  await step($, 't2')
  const status = (await $.command.run(run('status'))).text
  expect(pings).toBe(2)
  expect(status).not.toContain('observed from traffic')
  expect(status).toContain('5m cache')
})
