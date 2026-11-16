import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cacheState, heatOf, missReason, parseDuration, sendCost, viewOf } from '../hooks/cache'
import { langOf, pickLang, tallyOf } from '../hooks/i18n'
import type { Sample } from '../types'

const T0 = 1_800_000_000_000
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

test('the clock: warm, soon, cold', () => {
  const s = [big(T0)]
  expect(viewOf(s, '1h', T0 + 10 * 60_000, 0).kind).toBe('warm')
  expect(viewOf(s, '1h', T0 + 57 * 60_000, 0).kind).toBe('soon')
  expect(viewOf(s, '1h', T0 + 61 * 60_000, 0).kind).toBe('cold')
  expect(viewOf(s, '5m', T0 + 6 * 60_000, 0).kind).toBe('cold')
  expect(viewOf(s, '1h', T0 + 1000, T0 + 500).kind).toBe('compacted')
})

test('a cold send of 200k on Opus 5.5 with a 1h cache', () => {
  const cost = sendCost('claude-opus-5-5', 200_000, '1h')
  expect(cost?.cold.toFixed(2)).toBe('1.60') // 200k × $4 × 2
  expect(cost?.warm.toFixed(2)).toBe('0.04') // 200k × $0.20
  expect(sendCost('some-other-model', 1000, '1h')).toBeNull()
})

test('miss causes', () => {
  const prev = big(T0)
  expect(missReason(prev, big(T0 + 60_000, { read: 0, write: 200_000 }), '1h')).toContain('prefix')
  expect(missReason(prev, big(T0 + 2 * 3_600_000, { read: 0, write: 200_000 }), '1h')).toContain('expired')
  expect(missReason(prev, big(T0 + 60_000, { model: 'claude-sonnet-5-5', read: 0, write: 200_000 }), '1h')).toContain('model')
  expect(missReason(prev, big(T0 + 60_000), '1h')).toBeUndefined()
})

test('the time left goes from calm to amber to red', () => {
  const s = [big(T0)]
  const at = (min: number) => viewOf(s, '1h', T0 + min * 60_000, 0)
  expect(heatOf(at(10))).toEqual({ tone: 'muted', isAlert: false })
  expect(heatOf(at(35))).toEqual({ tone: 'warning', isAlert: false })
  expect(heatOf(at(50))).toEqual({ tone: 'warning', isAlert: true })
  expect(cacheState(at(50)).label).toBe('cooling')
  expect(heatOf(at(57))).toEqual({ tone: 'error', isAlert: true })
  expect(cacheState(at(57))).toEqual({ label: 'expiring', tone: 'error' })
  expect(heatOf(at(70))).toEqual({ tone: 'error', isAlert: true })
  expect(at(70).coldForMs).toBe(10 * 60_000)
})

test('the alert language: the setting, else what you write, else English', () => {
  expect(langOf('spanish')).toBe('es')
  expect(langOf('Français')).toBe('fr')
  expect(langOf('klingon')).toBeNull()
  const es = tallyOf('Igual ten en cuenta que mucha gente usa la suscripción, y por defecto inglés, pero se puede ajustar')
  expect(pickLang(null, es)).toBe('es')
  expect(pickLang('fr', es)).toBe('fr')
  expect(pickLang(null, tallyOf('can you show me how it looks'))).toBe('en')
  expect(pickLang(null, tallyOf('ok'))).toBe('en')
  expect(pickLang(null, tallyOf('Você pode me mostrar isso? Não sei se está certo'))).toBe('pt')
})

test('durations', () => {
  expect(parseDuration('90m')).toBe(90 * 60_000)
  expect(parseDuration('2h30m')).toBe(150 * 60_000)
  expect(parseDuration('soon')).toBeNull()
})

const engine = (on: On, seeded: Sample[]) => {
  mock.store(on)
  mock.clock(on, { now: T0 + 2 * 3_600_000 })
  on('command.register', () => ({ value: { command: 'cache' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('state.get', ($, e, next) =>
    e.key === 'samples' ? { value: { value: { shape: 'samples-1', value: seeded }, version: 1 } } : next(e),
  )
  // The question dialog is dismissed.
  on('tool.call', () => ({ deny: 'dismissed' }))
}

const run = (args: string) =>
  ({ command: 'cache', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const

test('a cold send of a large context is held, unless the guard is off', async ($, on) => {
  engine(on, [big(T0)])
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const held = await $.prompt.submit({ text: 'hola', origin: { kind: 'composer' }, wait: false })
  expect(held.drop).toContain('expired')

  await $.command.run(run('guard off'))
  const sent = await $.prompt.submit({ text: 'hola', origin: { kind: 'composer' }, wait: false })
  expect(sent.text).toBe('hola')
})

test('/cache warm arms keep-warm and /cache status says so', async ($, on) => {
  engine(on, [big(T0 + 2 * 3_600_000 - 60_000)])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run(run('warm 90m'))).text).toContain('1:30:00')
  expect((await $.command.run(run('status'))).text).toContain('Keeping warm')
  expect((await $.command.run(run('warm off'))).text).toContain('off')
})

test('the band and the pane draw on the terminal and desktop', async ($, on) => {
  engine(on, [big(T0 + 2 * 3_600_000 - 2 * 60_000)])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({
      plugin: 'cache-control',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /keep going/ })).toBeDefined()
    expect(JSON.stringify(await band.drawn())).toMatch(/[ >]warm[ <]/)
    expect(await band.find({ key: 'details' })).toBeDefined()
    await band.unmount()

    const pane = await $.ui.mount({
      plugin: 'cache-control',
      component: 'Pane',
      requestId: 'cache-control',
      surface,
      props: { title: 'Cache', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await pane.find({ type: 'Text', text: 'context' })).toBeDefined()
    expect(await pane.find({ key: 'guard' })).toBeDefined()
    await pane.unmount()
  }
})

const asking = (on: On, rateLimits: unknown[]) => {
  mock.store(on)
  mock.clock(on, { now: T0 + 70 * 60_000 })
  on('command.register', () => ({ value: { command: 'cache' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000 }, rateLimits } }) as never)
  on('state.get', ($, e, next) =>
    e.key === 'samples' ? { value: { value: { shape: 'samples-1', value: [big(T0)] }, version: 1 } } : next(e),
  )
  const asked: string[] = []
  on('tool.call', (_, e) => {
    asked.push(JSON.stringify(e))
    return { deny: 'dismissed' }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  return asked
}

test('on a subscription the cold-send question speaks of plan limits, in the language you write', async ($, on) => {
  const asked = asking(on, [{ kind: 'five_hour', percentUsed: 40, resetsAt: T0 + 3_600_000 }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const held = await $.prompt.submit({ text: 'puedes revisar si esto está bien y también el README', origin: { kind: 'composer' }, wait: false })
  expect(held.drop).toContain('No se envió')
  expect(asked[0]).toMatch(/venció hace \d/)
  expect(asked[0]).toContain('200k tokens')
  expect(asked[0]).toContain('límites de tu plan')
  expect(asked[0]).not.toContain('$')
  expect(asked[0]).toContain('Caché fría')
})

test('on the API it speaks of dollars, and English by default', async ($, on) => {
  const asked = asking(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'ok', origin: { kind: 'composer' }, wait: false })
  expect(asked[0]).toContain('API prices')
  expect(asked[0]).toContain('Send anyway (~$')
})
