/**
 * cache-control: a prompt-cache meter for Claude Code.
 *
 *   - turn.step reads each main-loop request's usage (read / written / new)
 *   - a band above the prompt: state, hit rate, countdown, cost of a cold send
 *   - a cold-send guard: with the cache expired and a large context, asks
 *     before the message goes out, with what it will cost
 *   - keep-warm: while armed (/cache warm 2h), a tool-less fork over the
 *     transcript shortly before expiry refreshes the cache for a cache read
 *   - /cache opens a pane with the countdown, the last request, the session's
 *     totals and savings, and the turns
 *
 * Costs are list-price estimates (a subscription is not billed per token, so
 * read them as the API-equivalent); cold/warm is an estimate from the clock.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ping, Sample } from '../types'
import {
  accountOf,
  bar,
  bar as textBar,
  costOf,
  decideTtl,
  fmtClock,
  fmtTokens,
  fmtUsd,
  hitRatio,
  missReason,
  observeTtl,
  parseDuration,
  promptTokens,
  sendCost,
  ttlMs,
  uncachedCostOf,
  viewOf,
} from './cache'
import type { Account, CacheEnv, Ttl, View } from './cache'

const PANE = 'cache-control'
const KEEP = 300
const TOAST_MIN = 20_000
const MAX_WARM = 12 * 3_600_000
const DEFAULT_WARM = 2 * 3_600_000
const PING_PROMPT = 'Cache keep-alive: reply with just "ok", no tools.'

const samples = atom({ plugin: 'cache-control', key: 'samples' } as const, [], { shape: 'samples-1' })
const observedTtl = atom({ plugin: 'cache-control', key: 'observedTtl' } as const, null, { shape: 'ttl-1' })
const compactedAt = atom({ plugin: 'cache-control', key: 'compactedAt' } as const, 0, { shape: 'compacted-1' })
const warmUntil = atom({ plugin: 'cache-control', key: 'warmUntil' } as const, 0, { shape: 'warm-1' })
const lastPing = atom({ plugin: 'cache-control', key: 'lastPing' } as const, null, { shape: 'ping-1' })
const guard = atom({ plugin: 'cache-control', key: 'guard' } as const, true, { shape: 'guard-1' })

// Module values: rebuilt by session.start after a reload.
let env: CacheEnv = {}
let setting: unknown
let account: Account = 'other'
let base: { ttl: Ttl; source: string } = { ttl: '5m', source: 'default' }
let ticker: { cancel: () => void } | undefined
let lastKey = ''
let toastedFor = 0
let isBusy = false
let isPinging = false
let nextPingAt = 0

/** When a ping goes out: this long before expiry. */
const leadMs = (ttl: Ttl) => (ttl === '1h' ? 10 * 60_000 : 60_000)

type Snapshot = { ttl: Ttl; ttlSource: string; view: View; list: Sample[]; warm: number; now: number }

async function snapshot($: EngineInterface): Promise<Snapshot> {
  const now = await $.clock.now()
  const seen = await read($, observedTtl)
  const ttl = seen ?? base.ttl
  const list = await read($, samples)
  return {
    ttl,
    ttlSource: seen ? `observed from traffic (${base.source} said ${base.ttl})` : base.source,
    view: viewOf(list, ttl, now, await read($, compactedAt)),
    list,
    warm: await read($, warmUntil),
    now,
  }
}

async function readSettingTtl($: EngineInterface): Promise<unknown> {
  const home = await $.env.get('HOME').catch(() => undefined)
  const cwd = await $.session.cwd().catch(() => undefined)
  const files = [cwd && `${cwd}/.claude/settings.local.json`, cwd && `${cwd}/.claude/settings.json`, home && `${home}/.claude/settings.json`]
  for (const file of files) {
    if (!file) continue
    try {
      const json = JSON.parse(await $.fs.read(file)) as { promptCacheTtl?: unknown }
      if (json.promptCacheTtl === '5m' || json.promptCacheTtl === '1h') return json.promptCacheTtl
    } catch {
      // missing or unreadable: the next one
    }
  }
  return undefined
}

async function refreshAccount($: EngineInterface, option: unknown) {
  account = accountOf((await $.session.usage().catch(() => undefined))?.rateLimits ?? [])
  base = decideTtl(option, env, setting, account)
}

async function ping($: EngineInterface) {
  if (isPinging) return
  isPinging = true
  try {
    const startedAt = await $.clock.now()
    const model = (await read($, samples)).at(-1)?.model ?? ''
    const r = await $.model.fork({ prompt: PING_PROMPT })
    if (!r.isAnswered) {
      const reason = 'reason' in r ? String(r.reason) : 'no reply'
      // A busy API: try again in a minute while the cache can still land.
      nextPingAt = startedAt + 60_000
      await update($, lastPing, () => ({ at: startedAt, read: 0, write: 0, usd: null, ok: false, note: reason }))
      return
    }
    const u = r.usage
    const sample: Sample = {
      turnId: 'ping',
      model,
      startedAt,
      read: u.cache_read_input_tokens,
      write: u.cache_creation_input_tokens,
      fresh: u.input_tokens,
      output: u.output_tokens,
      isPing: true,
    }
    const { ttl } = await snapshot($)
    const usd = costOf(sample, ttl)
    // Nothing read, or a large write: the cache had already gone, pinging is pointless.
    const ok = sample.read > 0 && sample.write < sample.read * 0.1
    await update($, samples, list => [...list, sample].slice(-KEEP))
    await update($, lastPing, () => ({
      at: startedAt,
      read: sample.read,
      write: sample.write,
      usd,
      ok,
      note: ok ? `read ${fmtTokens(sample.read)}` : 'the cache was already cold',
    }))
    if (!ok) {
      await update($, warmUntil, () => 0)
      $.ui.toast('cache-control: the cache was already cold, so keep-warm stopped.')
    }
  } catch (err) {
    $.ui.log(`cache-control: ping failed: ${String(err)}`, { to: 'debug' })
    nextPingAt = (await $.clock.now()) + 60_000
  } finally {
    isPinging = false
    lastKey = ''
    $.ui.invalidate('ui.render')
  }
}

async function tick($: EngineInterface, wantToast: boolean) {
  const s = await snapshot($)
  const { view, now, ttl, warm } = s
  const clock = view.leftMs > 0 ? fmtClock(view.leftMs) : ''
  const key = `${view.kind}|${clock}|${warm > now ? fmtClock(warm - now) : ''}|${view.miss ?? ''}`
  if (key !== lastKey) {
    lastKey = key
    $.ui.invalidate('ui.render')
  }

  const last = view.last
  if (wantToast && last && view.kind === 'soon' && view.tokens >= TOAST_MIN && warm <= now && toastedFor !== last.startedAt) {
    toastedFor = last.startedAt
    $.ui.toast(
      `The cache expires in ${fmtClock(view.leftMs)}: any message renews it; otherwise rewriting ${fmtTokens(view.tokens)} will cost ~${fmtUsd(view.cost?.cold)}.`,
    )
  }

  if (warm > now && !isBusy && !isPinging && now >= nextPingAt && (view.kind === 'warm' || view.kind === 'soon')) {
    if (view.leftMs <= leadMs(ttl)) void ping($)
  }
  if (warm > 0 && warm <= now) await update($, warmUntil, () => 0)
}

async function arm($: EngineInterface, ms: number) {
  const until = (await $.clock.now()) + Math.min(MAX_WARM, ms)
  await update($, warmUntil, () => until)
  lastKey = ''
}

function statusText(s: Snapshot, isGuarded: boolean, guardMin: number): string {
  const { view, ttl, warm, now } = s
  const lines = [`${ttl} cache (${s.ttlSource}).`]
  if (view.kind === 'none') lines.push('No requests yet.')
  else if (view.kind === 'cold') lines.push(`Cold: the next message rewrites ${fmtTokens(view.tokens)} (~${fmtUsd(view.cost?.cold)}).`)
  else if (view.kind === 'compacted') lines.push('Compacted: the next message starts from the summary.')
  else if (view.kind === 'uncached') lines.push('The last request was not cached.')
  else lines.push(`Warm: expires in ${fmtClock(view.leftMs)} (${fmtTokens(view.tokens)} tokens).`)
  if (view.miss) lines.push(`Last miss: ${view.miss}.`)
  lines.push(warm > now ? `Keeping warm for ${fmtClock(warm - now)} more.` : 'Keep-warm: off.')
  lines.push(`Confirm cold sends: ${isGuarded ? `yes, from ${fmtTokens(guardMin)} tokens` : 'no'}.`)
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  const guardMin = typeof options.guardMinTokens === 'number' && options.guardMinTokens > 0 ? options.guardMinTokens : 50_000
  const showBand = options.band !== false
  const wantToast = options.toast !== false

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const none = () => undefined
    env = {
      enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H').catch(none),
      force5m: await $.env.get('FORCE_PROMPT_CACHING_5M').catch(none),
      ttlVar: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL').catch(none),
      disableAll: await $.env.get('DISABLE_PROMPT_CACHING').catch(none),
    }
    setting = await readSettingTtl($)
    await refreshAccount($, options.ttl)
    const stored = await $.store.get('guard')
    if (typeof stored === 'boolean') await update($, guard, () => stored)

    await $.command.register({
      name: 'cache',
      description: 'Prompt cache: pane, keep-warm and cold-send confirmation',
      argumentHint: '[warm [2h] | warm off | guard on|off | status]',
    })

    lastKey = ''
    ticker?.cancel()
    ticker = $.clock.every(1000, () => void tick($, wantToast))
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      // /clear starts a new conversation and a new cache.
      await update($, samples, () => [])
      await update($, observedTtl, () => null)
      await update($, warmUntil, () => 0)
      lastKey = ''
      return next(e)
    }
    ticker?.cancel()
    ticker = undefined
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || String(e.trigger) === 'precompute' || 'skip' in r) return r
    const now = await $.clock.now()
    await update($, compactedAt, () => now)
    lastKey = ''
    return r
  })

  // Each main-loop request: what the cache did with it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const startedAt = await $.clock.now()
    const r = yield* next(e)
    if (r.usage) {
      const sample: Sample = {
        turnId: e.turnId,
        model: r.usage.model || e.model,
        startedAt,
        read: r.usage.cache_read_input_tokens,
        write: r.usage.cache_creation_input_tokens,
        fresh: r.usage.input_tokens,
        output: r.usage.output_tokens,
      }
      const before = await read($, samples)
      await update($, samples, list => [...list, sample].slice(-KEEP))
      if (options.ttl !== '5m' && options.ttl !== '1h') {
        await refreshAccount($, options.ttl)
        const prev = before.filter(s => !s.isPing).at(-1)
        const seen = observeTtl(prev, sample, await read($, observedTtl))
        await update($, observedTtl, () => seen)
      }
      lastKey = ''
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // The cold-send guard, and the busy flag that keeps pings off a running turn.
  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' && !e.command && !e.isMeta
    if (isPerson && (await read($, guard))) {
      const { view } = await snapshot($)
      if (view.kind === 'cold' && view.tokens >= guardMin && view.cost) {
        const cold = fmtUsd(view.cost.cold)
        const warm = fmtUsd(view.cost.warm)
        const send = `Send anyway (~${cold})`
        try {
          const answer = await $.ui.ask(
            `The cache expired: this message rewrites ${fmtTokens(view.tokens)} tokens (~${cold} at API prices, vs ~${warm} warm). Send it?`,
            { options: [send, 'Don\'t send'], header: 'Cold cache' },
          )
          if (answer !== send) return { drop: 'Not sent: the cache was cold. Try /compact or /clear, or send it again.' }
        } catch {
          return { drop: 'Not sent: the cache was cold and nobody confirmed.' }
        }
      }
    }
    isBusy = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isBusy = false
    return next(e)
  })

  on('command.run', { command: 'cache' }, async ($, e) => {
    const [verb = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (verb === '') {
      await $.ui.open({ id: PANE, title: 'Cache' })
      return { text: 'Cache pane opened.' }
    }
    if (verb === 'warm') {
      if (arg === 'off') {
        await update($, warmUntil, () => 0)
        return { text: 'Keep-warm: off.' }
      }
      const ms = arg ? parseDuration(arg) : DEFAULT_WARM
      if (!ms) return { text: 'Usage: /cache warm 90m · /cache warm 2h · /cache warm off' }
      await arm($, ms)
      const { ttl } = await snapshot($)
      return {
        text: `Keeping the cache warm for ${fmtClock(Math.min(MAX_WARM, ms))}: a ping ${ttl === '1h' ? '10 min' : '1 min'} before it expires, while you are idle.`,
      }
    }
    if (verb === 'guard' && (arg === 'on' || arg === 'off')) {
      await update($, guard, () => arg === 'on')
      await $.store.set('guard', arg === 'on')
      return { text: `Confirm cold sends: ${arg}.` }
    }
    if (verb === 'status') return { text: statusText(await snapshot($), await read($, guard), guardMin) }
    return { text: 'Usage: /cache · /cache warm [2h] · /cache warm off · /cache guard on|off · /cache status' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)
    const { view, warm, now, ttl } = await snapshot($)
    if (view.kind === 'none' || !view.last) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const color = { warm: 'success', soon: 'warning', cold: 'error', compacted: 'inactive', uncached: 'inactive', none: 'inactive' }[view.kind]
    const last = [...(await read($, samples))].reverse().find(x => !x.isPing) ?? view.last
    const hit = hitRatio(last)
    const word = { warm: 'warm', soon: 'expiring', cold: 'cold', compacted: 'compacted', uncached: 'uncached', none: '' }[view.kind]
    const advice =
      view.kind === 'warm'
        ? view.miss
          ? `missed: ${view.miss}`
          : `keep going · a cold send would cost ~${fmtUsd(view.cost?.cold)}`
        : view.kind === 'soon'
          ? `any message renews it for free · cold it costs ~${fmtUsd(view.cost?.cold)}`
          : view.kind === 'cold'
            ? `the next message rewrites ${fmtTokens(view.tokens)} (~${fmtUsd(view.cost?.cold)} vs ~${fmtUsd(view.cost?.warm)} warm) · /compact or /clear first`
            : view.kind === 'compacted'
              ? 'the next message starts from the summary'
              : 'prompt under the model minimum, or caching off'

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text>
            <Text color={color}>● cache </Text>
            <Text color={hit >= 0.8 ? 'success' : hit >= 0.4 ? 'warning' : 'error'}>{bar(hit, 10)}</Text>
            <Text> {Math.round(hit * 100)}%</Text>
            <Text dimColor>
              {' '}
              read {fmtTokens(last.read)} · wrote {fmtTokens(last.write)} · new {fmtTokens(last.fresh)}
            </Text>
            {view.leftMs > 0 && <Text color={color}> ⏱ {fmtClock(view.leftMs)}</Text>}
            <Text dimColor> {ttl}</Text>
            {warm > now && <Text color="warning"> ♨ {fmtClock(warm - now)}</Text>}
          </Text>
          <Button key="details" plain dimColor label="Details" onPress={() => void $.ui.open({ id: PANE, title: 'Cache' })} />
        </Box>
        <Text dimColor={view.kind === 'warm' && !view.miss} color={view.kind === 'cold' || view.miss ? 'error' : undefined}>
          {word}: {advice}
        </Text>
      </Box>
    )
  })

  // The pane: one status block, four stat tiles, then sections. Desktop draws
  // real progress bars and chip buttons; the terminal gets text bars instead.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const s = await snapshot($)
    const { view, ttl, warm, now, list } = s
    const isGuarded = await read($, guard)
    const ping: Ping | null = await read($, lastPing)
    const cols = e.props.bodyColumns ?? 50

    const turns = list.filter(x => !x.isPing)
    const pings = list.filter(x => x.isPing)
    const sum = (xs: Sample[], f: (x: Sample) => number | null) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)
    const spent = sum(turns, x => costOf(x, ttl))
    const without = sum(turns, uncachedCostOf)
    const pingSpent = sum(pings, x => costOf(x, ttl))
    const tot = turns.reduce((a, x) => ({ read: a.read + x.read, write: a.write + x.write, fresh: a.fresh + x.fresh }), {
      read: 0,
      write: 0,
      fresh: 0,
    })
    const totalPrompt = tot.read + tot.write + tot.fresh
    const sessionHit = totalPrompt ? tot.read / totalPrompt : 0
    const missed = turns.filter((x, i) => i > 0 && missReason(turns[i - 1], x, ttl) !== undefined)

    const color = { warm: 'success', soon: 'warning', cold: 'error', compacted: 'inactive', uncached: 'inactive', none: 'inactive' }[view.kind]
    const title = { warm: 'Warm', soon: 'Expiring soon', cold: 'Cold', compacted: 'Compacted', uncached: 'Not cached', none: 'No requests yet' }[
      view.kind
    ]
    const subtitle =
      view.kind === 'cold'
        ? `The next message rewrites ${fmtTokens(view.tokens)} tokens`
        : view.kind === 'soon'
          ? 'Send anything to renew it for free'
          : view.kind === 'compacted'
            ? 'The next message starts from the summary'
            : view.kind === 'none'
              ? 'The first request writes the cache'
              : `${ttl} cache · ${s.ttlSource}`

    const bar = (label: string, value: number, valueText: string, fill: string) =>
      'Progress' in table ? (
        <table.Progress label={label} value={value} valueText={valueText} color={fill} />
      ) : (
        <Text>
          <Text dimColor>{label} </Text>
          <Text color={fill}>{textBar(value, Math.max(10, Math.min(30, cols - label.length - valueText.length - 4)))}</Text>
          <Text dimColor> {valueText}</Text>
        </Text>
      )

    const tile = (k: string, value: string, caption: string, tone?: string) => (
      <Box key={`tile:${k}`} flexDirection="column" flexGrow={1}>
        <Text size="title" weight="semibold" color={tone}>
          {value}
        </Text>
        <Text size="caption" dimColor>
          {caption}
        </Text>
      </Box>
    )

    const heading = (text: string, aside?: string) => (
      <Box justifyContent="space-between" marginTop={1}>
        <Text weight="semibold">{text}</Text>
        {aside !== undefined && (
          <Text size="caption" dimColor>
            {aside}
          </Text>
        )}
      </Box>
    )

    // One row per turn, newest first.
    const byTurn = new Map<string, Sample[]>()
    for (const x of turns) byTurn.set(x.turnId, [...(byTurn.get(x.turnId) ?? []), x])
    const rows = [...byTurn.entries()].slice(-8).reverse()
    const cell = (w: number, text: string, opts: { dim?: boolean; color?: string; right?: boolean } = {}) => (
      <Box width={w} justifyContent={opts.right ? 'flex-end' : 'flex-start'}>
        <Text dimColor={opts.dim} color={opts.color} tabular>
          {text}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        {/* Status */}
        <Box flexDirection="column">
          <Text size="heading" weight="semibold">
            <Text color={color}>● </Text>
            {title}
          </Text>
          <Text size="caption" dimColor>
            {subtitle}
          </Text>
        </Box>
        {view.leftMs > 0 && (
          <Box marginTop={1}>{bar('Expires in', view.leftMs / ttlMs(ttl), fmtClock(view.leftMs), color)}</Box>
        )}

        {/* Tiles */}
        {view.kind !== 'none' && (
          <Box marginTop={1} gap={2}>
            {tile('ctx', fmtTokens(view.tokens), 'context')}
            {tile('hit', `${Math.round(sessionHit * 100)}%`, 'from cache', sessionHit >= 0.8 ? 'success' : sessionHit >= 0.4 ? 'warning' : 'error')}
            {tile('cold', fmtUsd(view.cost?.cold), 'if sent cold', view.kind === 'cold' ? 'error' : undefined)}
            {tile('saved', fmtUsd(Math.max(0, without - spent)), 'saved', 'success')}
          </Box>
        )}

        {/* Last request */}
        {view.last && !view.last.isPing && (
          <Box flexDirection="column">
            {heading('Last request', view.miss ? `missed: ${view.miss}` : `${Math.round(hitRatio(view.last) * 100)}% hit`)}
            {bar(
              'Read from cache',
              hitRatio(view.last),
              `${fmtTokens(view.last.read)} read · ${fmtTokens(view.last.write)} written · ${fmtTokens(view.last.fresh)} new`,
              view.miss ? 'error' : 'success',
            )}
          </Box>
        )}

        {/* Session */}
        {turns.length > 0 && (
          <Box flexDirection="column">
            {heading('Session', `${turns.length} requests`)}
            <Text dimColor>
              {fmtUsd(spent)} spent, {fmtUsd(without)} without cache · {fmtTokens(tot.write)} written ·{' '}
              {missed.length ? `${missed.length} miss${missed.length === 1 ? '' : 'es'}` : 'no misses'}
            </Text>
            <Text size="caption" dimColor>
              {view.last?.model ?? ''} · API list prices; on a subscription this is an equivalent, not a charge.
            </Text>
          </Box>
        )}

        {/* Keep warm */}
        {heading('Keep warm', warm > now ? `${fmtClock(warm - now)} left` : 'off')}
        <Text dimColor>
          {warm > now
            ? `A ping goes out ${ttl === '1h' ? '10 min' : '1 min'} before expiry while you are idle.`
            : 'Pings the cache before it expires, so a break does not cost a cold send.'}
          {pings.length ? ` ${pings.length} pings so far, ${fmtUsd(pingSpent)}.` : ''}
          {ping ? ` Last: ${ping.note}.` : ''}
        </Text>
        <Box gap={1} marginTop={1}>
          <Button key="warm-1h" label="1 hour" onPress={() => void arm($, 3_600_000)} />
          <Button key="warm-3h" label="3 hours" onPress={() => void arm($, 3 * 3_600_000)} />
          <Button key="warm-8h" label="8 hours" onPress={() => void arm($, 8 * 3_600_000)} />
          {warm > now && <Button key="warm-off" variant="secondary" label="Stop" onPress={() => void update($, warmUntil, () => 0)} />}
        </Box>

        {/* Guard */}
        {heading('Confirm cold sends')}
        <Box justifyContent="space-between" alignItems="center">
          <Text dimColor>
            {isGuarded ? `Asks before sending when the cache is cold and the context is ${fmtTokens(guardMin)}+ tokens.` : 'Off: cold sends go out without asking.'}
          </Text>
          <Button
            key="guard"
            variant={isGuarded ? 'secondary' : 'primary'}
            label={isGuarded ? 'Turn off' : 'Turn on'}
            onPress={() =>
              void (async () => {
                await update($, guard, g => !g)
                await $.store.set('guard', await read($, guard))
              })()
            }
          />
        </Box>

        {/* Turns */}
        {rows.length > 0 && (
          <Box flexDirection="column">
            {heading('Turns', 'newest first')}
            <Box>
              {cell(6, 'turn', { dim: true })}
              {cell(7, 'hit', { dim: true, right: true })}
              {cell(9, 'read', { dim: true, right: true })}
              {cell(9, 'written', { dim: true, right: true })}
              {cell(9, 'cost', { dim: true, right: true })}
            </Box>
            {rows.map(([id, xs], i) => {
              const r = xs.reduce((a, x) => ({ read: a.read + x.read, write: a.write + x.write, fresh: a.fresh + x.fresh }), {
                read: 0,
                write: 0,
                fresh: 0,
              })
              const total = r.read + r.write + r.fresh
              const pct = total ? Math.round((r.read / total) * 100) : 0
              return (
                <Box key={`t:${id}`}>
                  {cell(6, `#${byTurn.size - i}`, { dim: true })}
                  {cell(7, `${pct}%`, { right: true, color: pct >= 80 ? 'success' : pct >= 40 ? 'warning' : 'error' })}
                  {cell(9, fmtTokens(r.read), { right: true })}
                  {cell(9, fmtTokens(r.write), { right: true })}
                  {cell(9, fmtUsd(sum(xs, x => costOf(x, ttl))), { right: true })}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
