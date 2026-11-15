/**
 * usage-bar: your plan's usage windows above the prompt, and a pane with the
 * pace and budget for each.
 *
 *   - the windows are what the last API response reported (`five_hour`,
 *     `seven_day`, a model's own week such as Fable's): a session on an API
 *     key reports none, and the band stays away
 *   - each window's start is its reset minus its length; an even pace would
 *     have used the share of time gone, and the budget spreads what is left
 *     over the time that is left
 *   - "today" counts from the first reading this mod saw on the local day
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DayMark, Window } from '../types'
import { dayOf, fmtLeft, fmtPct, fmtWhen, labelOf, meter, paceOf, sortWindows, titleOf, toneOf } from './usage'

const PANE = 'usage-bar'
const windows = atom({ plugin: 'usage-bar', key: 'windows' } as const, [], { shape: 'windows-1' })
const readAt = atom({ plugin: 'usage-bar', key: 'readAt' } as const, 0, { shape: 'read-1' })
const marks = atom({ plugin: 'usage-bar', key: 'marks' } as const, {}, { shape: 'marks-1' })

let ticker: { cancel: () => void } | undefined

async function refresh($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  const list: Window[] = sortWindows(
    (usage?.rateLimits ?? []).map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })),
  )
  const now = await $.clock.now()
  if (list.length > 0) await update($, windows, () => list)
  await update($, readAt, () => now)

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
    await $.command.register({ name: 'usage', description: 'Plan usage: each window, its pace and a daily budget' })
    ticker?.cancel()
    ticker = $.clock.every(60_000, () => void refresh($))
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

  on('command.run', { command: 'usage' }, async $ => {
    await refresh($)
    await openPane($)
    const list = await read($, windows)
    if (list.length === 0) return { text: 'No usage windows reported yet (an API key reports none).' }
    return { text: 'Usage pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, windows)
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    return (
      <Box justifyContent="space-between">
        <Box gap={3}>
          {list.map(w => {
            const p = paceOf(w, now)
            const tone = toneOf(p)
            return (
              <Text key={`w:${w.kind}`}>
                <Text dimColor>{labelOf(w.kind)} </Text>
                <Text color={tone}>{meter(p.used)}</Text>
                <Text> {fmtPct(p.used)}</Text>
                {p.leftMs !== null && <Text dimColor> · {fmtLeft(p.leftMs)}</Text>}
              </Text>
            )
          })}
        </Box>
        <Button key="details" plain dimColor label="Details" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const list = await read($, windows)
    const dayMarks = await read($, marks)
    const now = await $.clock.now()
    const at = await read($, readAt)

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text size="heading" weight="semibold">
            No usage windows yet
          </Text>
          <Box marginTop={1}>
            <Text dimColor>
              They come with the next reply from the API. A session on an API key or a cloud provider reports none.
            </Text>
          </Box>
        </Box>
      )
    }

    const bar = (w: Window, tone: string) =>
      'Progress' in table ? (
        <table.Progress label={titleOf(w.kind)} value={w.percentUsed} max={100} valueText={`${fmtPct(w.percentUsed)} used`} color={tone} />
      ) : (
        <Text>
          <Text weight="semibold">{titleOf(w.kind)} </Text>
          <Text color={tone}>{meter(w.percentUsed, 20)}</Text>
          <Text> {fmtPct(w.percentUsed)}</Text>
        </Text>
      )

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
          Read {at ? fmtWhen(at, now) : 'not yet'} · from the last reply's rate-limit headers
        </Text>

        {list.map(w => {
          const p = paceOf(w, now)
          const tone = toneOf(p)
          const mark = dayMarks[w.kind]
          const usedToday = mark && mark.day === dayOf(now) ? Math.max(0, w.percentUsed - mark.startPct) : null
          const isLong = p.perDay !== null
          const budget = isLong ? p.perDay : p.perHour
          const verdict =
            p.delta === null
              ? null
              : Math.abs(p.delta) < 2
                ? 'right on pace'
                : p.delta < 0
                  ? `${Math.round(-p.delta)} pts under an even pace`
                  : `${Math.round(p.delta)} pts over an even pace`
          return (
            <Box key={`win:${w.kind}`} flexDirection="column" marginTop={2}>
              {bar(w, tone)}
              <Box marginTop={1}>
                <Text dimColor>
                  {p.startsAt !== null ? `Started ${fmtWhen(p.startsAt, now)} · ` : ''}
                  {p.resetsAt !== null ? `resets ${fmtWhen(p.resetsAt, now)}` : 'no reset reported'}
                  {p.leftMs !== null ? ` (in ${fmtLeft(p.leftMs)})` : ''}
                </Text>
              </Box>
              {p.expected !== null && (
                <Text dimColor>
                  An even pace would be at {fmtPct(p.expected)} by now:{' '}
                  <Text color={tone}>{verdict}</Text>.
                </Text>
              )}
              <Box marginTop={1} gap={3}>
                {budget !== null &&
                  tile(
                    `b:${w.kind}`,
                    `${fmtPct(budget)}`,
                    isLong ? 'per day to last until reset' : 'per hour to last until reset',
                  )}
                {isLong && usedToday !== null &&
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
                  p.runsOutAt !== null ? 'error' : 'success',
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
