/**
 * The pure half of usage-bar: windows, pace and budgets, no `$`.
 *
 * A window's start is its reset minus its length (5 hours, 7 days), so the
 * share of time gone is how much of the limit an even pace would have used
 * by now. The budget spreads what is left over what time is left.
 */
import type { Window } from '../types'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** How long a window runs, by its kind; null for a kind with no fixed length. */
export function lengthOf(kind: string): number | null {
  if (kind === 'five_hour' || kind.startsWith('five_hour')) return 5 * HOUR
  if (kind === 'seven_day' || kind.startsWith('seven_day')) return 7 * DAY
  return null
}

/** A short label: `5h`, `Week`, `Fable week` (from `seven_day_fable`), `Spend`. */
export function labelOf(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return 'Week'
  if (kind === 'spend_limit') return 'Spend'
  const m = /^(five_hour|seven_day)_(.+)$/.exec(kind)
  if (m) {
    const model = (m[2] ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
    return `${model} ${m[1] === 'five_hour' ? '5h' : 'week'}`
  }
  return kind.replace(/_/g, ' ')
}

/** A longer title for the pane. */
export function titleOf(kind: string): string {
  if (kind === 'five_hour') return '5-hour window'
  if (kind === 'seven_day') return 'Weekly limit'
  if (kind === 'spend_limit') return 'Spend limit'
  const l = labelOf(kind)
  return l.endsWith('week') ? `${l.slice(0, -5)} weekly limit` : `${l.slice(0, -3)} 5-hour window`
}

export type Pace = {
  used: number
  /** What an even pace would have used by now, 0 to 100; null without a start. */
  expected: number | null
  /** used − expected, in points; negative is under pace. */
  delta: number | null
  startsAt: number | null
  resetsAt: number | null
  leftMs: number | null
  /** Percent per day that lasts until the reset; null for windows under a day. */
  perDay: number | null
  /** Percent per hour that lasts until the reset. */
  perHour: number | null
  /** At the current rate, when 100% would be hit; null when it won't before reset. */
  runsOutAt: number | null
}

export function paceOf(w: Window, now: number): Pace {
  const resetsAt = w.resetsAt ? Date.parse(w.resetsAt) : NaN
  const length = lengthOf(w.kind)
  const used = w.percentUsed
  if (!Number.isFinite(resetsAt) || length === null) {
    return { used, expected: null, delta: null, startsAt: null, resetsAt: Number.isFinite(resetsAt) ? resetsAt : null, leftMs: null, perDay: null, perHour: null, runsOutAt: null }
  }
  const startsAt = resetsAt - length
  const leftMs = Math.max(0, resetsAt - now)
  const elapsed = Math.min(length, Math.max(0, now - startsAt))
  const expected = (elapsed / length) * 100
  const remaining = Math.max(0, 100 - used)
  const perHour = leftMs > 0 ? remaining / (leftMs / HOUR) : null
  const perDay = length >= DAY && leftMs > 0 ? remaining / Math.max(leftMs / DAY, 1 / 24) : null
  const rate = elapsed > 0 ? used / elapsed : 0
  const runsOutAt = rate > 0 && used < 100 ? now + (100 - used) / rate : used >= 100 ? now : null
  return {
    used,
    expected,
    delta: used - expected,
    startsAt,
    resetsAt,
    leftMs,
    perDay,
    perHour,
    runsOutAt: runsOutAt !== null && runsOutAt < resetsAt ? runsOutAt : null,
  }
}

/** Green under pace, amber a little over, red well over or nearly full. */
export function toneOf(p: Pace): 'success' | 'warning' | 'error' {
  if (p.used >= 90) return 'error'
  if (p.delta === null) return p.used >= 70 ? 'warning' : 'success'
  if (p.delta > 15) return 'error'
  if (p.delta > 3) return 'warning'
  return 'success'
}

/** The local calendar day of `ms`, as `YYYY-MM-DD`. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtLeft(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(mm).padStart(2, '0')}m`
  return `${mm}m`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Thu 20 Nov, 09:00` (or `today 14:30`, `tomorrow 09:00`). */
export function fmtWhen(ms: number, now: number): string {
  const d = new Date(ms)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (dayOf(ms) === dayOf(now)) return `today ${hhmm}`
  if (dayOf(ms) === dayOf(now + DAY)) return `tomorrow ${hhmm}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hhmm}`
}

export const fmtPct = (n: number) => `${n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.round(n)}%`

/** How many of `cells` a percentage fills, and how many stay empty. */
export function meterCells(pct: number, cells = 10): { filled: number; empty: number } {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells)
  return { filled, empty: cells - filled }
}

/** Text meter (kept for anything that wants one string). */
export function meter(pct: number, cells = 6): string {
  const n = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells)
  return '▰'.repeat(n) + '▱'.repeat(cells - n)
}

/** Order: 5h first, then weekly, then model windows, then anything else. */
export function sortWindows<T extends { kind: string }>(ws: readonly T[]): T[] {
  const rank = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : k.startsWith('seven_day_') || k.startsWith('five_hour_') ? 2 : 3)
  return [...ws].sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind))
}
