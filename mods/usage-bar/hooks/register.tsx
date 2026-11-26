/**
 * usage-bar: your plan's usage windows above the prompt, and a pane with the
 * pace and budget for each.
 *
 *   - the windows are the freshest reading any open session has stored
 *     (`five_hour`, `seven_day`, a model's own week such as Fable's): a
 *     session on an API key reports none, and the band stays away
 *   - each window's start is its reset minus its length; an even pace would
 *     have used the share of time gone, and the budget spreads what is left
 *     over the time that is left
 *   - "today" counts from the first reading this mod saw on the local day
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DayMark, Window } from '../types'
import { chip, slimBar, THEME_TONE } from './slim'
import { dayOf, fmtLeft, fmtPct, fmtWhen, hasReset, isWindow, labelOf, mergeReadings, paceOf, paceState, sortWindows, titleOf } from './usage'
import type { Reading } from './usage'

const PANE = 'usage-bar'
const windows = atom({ plugin: 'usage-bar', key: 'windows' } as const, [], { shape: 'windows-1' })
const readAt = atom({ plugin: 'usage-bar', key: 'readAt' } as const, 0, { shape: 'read-1' })
const marks = atom({ plugin: 'usage-bar', key: 'marks' } as const, {}, { shape: 'marks-1' })

let ticker: { cancel: () => void } | undefined

const READING = 'reading:'

/**
 * Every session stores its own reading under `reading:<session id>`, and every
 * refresh shows the freshest of all of them: the limits are the account's, so
 * another session's newer reply counts here too. Readings whose windows have
 * all reset are pruned.
 */
async function refresh($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  const own: Window[] = sortWindows(
    (usage?.rateLimits ?? []).map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })),
  )
  const now = await $.clock.now()
  const readings: Reading[] = []
  if (own.length > 0) {
    readings.push({ at: now, list: own })
    const sid = await $.session.id().catch(() => undefined)
    if (sid) await $.store.set(`${READING}${sid}`, { at: now, list: own }).catch(() => undefined)
  }
  const keys = await $.store.keys().catch(() => [] as string[])
  for (const key of keys) {
    if (!key.startsWith(READING)) continue
    const got = await $.store.get(key).then(
      v => ({ ok: true as const, r: v as Reading | undefined }),
      () => ({ ok: false as const, r: undefined }),
    )
    if (!got.ok) continue
    const r = got.r
    const live = Array.isArray(r?.list) ? r.list.filter(w => isWindow(w) && !hasReset(w, now)) : []
    if (live.length === 0) {
      await $.store.delete(key).catch(() => undefined)
      continue
    }
    readings.push({ at: Number(r!.at) || 0, list: live })
  }
  const list = mergeReadings(readings, now)
  await update($, windows, () => list)
  await update($, readAt, () => Math.max(0, ...readings.map(r => r.at)))

  // The first reading of each window on the local day; a reset since then starts it over.
  const today = dayOf(now)
  const before = await read($, marks)
  const next: Record<string, DayMark> = { ...before }
  for (const w of list) {
    const m = next[w.kind]
    if (!m || m.day !== today) next[w.kind] = { day: today, startPct: w.percentUsed }
    else if (w.percentUsed < m.startPct) next[w.kind] = { day: today, startPct: 0 }
  }
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    await update($, marks, () => next)
    await $.store.set('marks', next)
  }
  $.ui.invalidate('ui.render')
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Usage' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const stored = await $.store.get('marks')
    if (stored && typeof stored === 'object') await update($, marks, () => stored as Record<string, DayMark>)
    await $.command
      .register({ name: 'limits', description: 'Plan usage limits: each window, its pace and a daily budget' })
      .catch(err => $.ui.log(`usage-bar: /limits not registered: ${String(err)}`, { to: 'debug' }))
    ticker?.cancel()
    ticker = $.clock.every(30_000, () => void refresh($))
    void refresh($)
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') {
      ticker?.cancel()
      ticker = undefined
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void refresh($)
    return r
  })

  // Pushed by the engine the moment a window moves a whole point, without
  // waiting for the turn to end or the next minute.
  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (e.changed.includes('rateLimits')) void refresh($).catch(() => undefined)
    return r
  })

  on('command.run', { command: 'limits' }, async $ => {
    await refresh($)
    await openPane($)
    const list = await read($, windows)
    if (list.length === 0) return { text: 'No usage windows reported yet (an API key reports none).' }
    return { text: 'Usage pane opened.' }
  })

  // The band: per window, its label, a slim bar with the even-pace mark, the
  // percentage, a state chip and the time to reset.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await $.clock.now()
    const list = (await read($, windows)).filter(w => !hasReset(w, now))
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box justifyContent="space-between" alignItems="center">
        <Box gap={4} alignItems="center">
          {list.map(w => {
            const p = paceOf(w, now)
            const state = paceState(p)
            return (
              <Box key={`w:${w.kind}`} gap={1} alignItems="center">
                <Text dimColor>{labelOf(w.kind)}</Text>
                {slimBar($, e, [{ share: p.used / 100, tone: state.tone }], p.expected === null ? null : p.expected / 100, {
                  width: 96,
                  cells: 10,
                  key: `bar:${w.kind}`,
                })}
                <Text>{fmtPct(p.used)}</Text>
                {chip($, e, state.label, state.tone)}
                {p.leftMs !== null && <Text dimColor>{fmtLeft(p.leftMs)}</Text>}
              </Box>
            )
          })}
        </Box>
        <Button key="details" plain dimColor label="Details" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const list = (await read($, windows)).filter(w => !hasReset(w, now))
    const dayMarks = await read($, marks)
    const at = await read($, readAt)
    const cols = e.props.bodyColumns ?? 50

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text size="heading" weight="semibold">
            No usage windows yet
          </Text>
          <Box marginTop={1}>
            <Text dimColor>They come with the next reply from the API. A session on an API key or a cloud provider reports none.</Text>
          </Box>
        </Box>
      )
    }

    const tile = (k: string, value: string, caption: string, tone?: string) => (
      <Box key={k} flexDirection="column" flexGrow={1}>
        <Text size="title" weight="semibold" color={tone}>
          {value}
        </Text>
        <Text size="caption" dimColor>
          {caption}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Text size="heading" weight="semibold">
            Usage
          </Text>
          <Button key="refresh" variant="secondary" label="Refresh" onPress={() => void refresh($)} />
        </Box>
        <Text size="caption" dimColor>
          Read {at ? fmtWhen(at, now) : 'not yet'} · the mark on each bar is where an even pace would be now
        </Text>

        {list.map(w => {
          const p = paceOf(w, now)
          const state = paceState(p)
          const tone = THEME_TONE[state.tone]
          const mark = dayMarks[w.kind]
          const usedToday = mark && mark.day === dayOf(now) ? Math.max(0, w.percentUsed - mark.startPct) : null
          const isLong = p.perDay !== null
          const budget = isLong ? p.perDay : p.perHour
          const gap =
            p.delta === null
              ? null
              : Math.abs(p.delta) <= 3
                ? `An even pace would be at ${fmtPct(p.expected ?? 0)} by now.`
                : `An even pace would be at ${fmtPct(p.expected ?? 0)} by now: you're ${Math.round(Math.abs(p.delta))} points ${p.delta < 0 ? 'under' : 'over'}.`
          return (
            <Box key={`win:${w.kind}`} flexDirection="column" marginTop={2}>
              <Box justifyContent="space-between" alignItems="center">
                <Text weight="semibold">{titleOf(w.kind)}</Text>
                <Box gap={1} alignItems="center">
                  <Text weight="semibold">{fmtPct(p.used)}</Text>
                  {chip($, e, state.label, state.tone)}
                </Box>
              </Box>
              <Box marginTop={1}>
                {slimBar($, e, [{ share: p.used / 100, tone: state.tone }], p.expected === null ? null : p.expected / 100, {
                  width: 360,
                  cells: Math.max(20, Math.min(48, cols - 4)),
                  key: `pbar:${w.kind}`,
                })}
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>
                  {p.startsAt !== null ? `Started ${fmtWhen(p.startsAt, now)} · ` : ''}
                  {p.resetsAt !== null ? `resets ${fmtWhen(p.resetsAt, now)}` : 'no reset reported'}
                  {p.leftMs !== null ? ` (in ${fmtLeft(p.leftMs)})` : ''}
                </Text>
                {gap !== null && <Text dimColor>{gap}</Text>}
              </Box>
              <Box marginTop={1} gap={3}>
                {budget !== null &&
                  tile(`b:${w.kind}`, fmtPct(budget), isLong ? 'per day to last until reset' : 'per hour to last until reset')}
                {isLong &&
                  usedToday !== null &&
                  tile(
                    `t:${w.kind}`,
                    fmtPct(usedToday),
                    budget !== null ? `used today of ${fmtPct(budget)}` : 'used today',
                    budget !== null && usedToday > budget ? 'warning' : undefined,
                  )}
                {tile(
                  `r:${w.kind}`,
                  p.runsOutAt !== null ? fmtWhen(p.runsOutAt, now) : 'Lasts',
                  p.runsOutAt !== null ? 'runs out at this pace' : 'to the reset at this pace',
                  p.runsOutAt !== null ? 'error' : tone,
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
