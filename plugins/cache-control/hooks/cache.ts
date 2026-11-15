/**
 * The pure half of cache-control: no `$`, no engine.
 * TTL rules and the miss/TTL inference follow prompt-cache-control
 * (claude-code-templates, MIT); pricing follows Anthropic's list prices.
 */
import type { Sample } from '../types'

export type Ttl = '5m' | '1h'

export const ttlMs = (t: Ttl) => (t === '1h' ? 3_600_000 : 300_000)
export const isOn = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'true'
export const promptTokens = (s: Sample) => s.read + s.write + s.fresh
export const hitRatio = (s: Sample) => {
  const t = promptTokens(s)
  return t === 0 ? 0 : s.read / t
}

// ---- prices, USD per million tokens ----------------------------------------

export type Price = { input: number; output: number; read: number }

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-2/, { input: 8, output: 40, read: 0.2 }],
  [/(fable|mythos)-5-1/, { input: 10, output: 50, read: 0.25 }],
  [/(fable|mythos)-5\b/, { input: 10, output: 50, read: 1 }],
  [/opus-5-5/, { input: 4, output: 20, read: 0.2 }],
  [/opus-(5|4-[678])\b/, { input: 5, output: 25, read: 0.5 }],
  [/sonnet-5-5/, { input: 2, output: 10, read: 0.1 }],
  [/sonnet-5\b/, { input: 2, output: 10, read: 0.2 }],
  [/sonnet-4-6/, { input: 3, output: 15, read: 0.3 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5, read: 0.01 }],
  [/haiku-4-5/, { input: 1, output: 5, read: 0.1 }],
]

export const priceOf = (model: string): Price | null =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? null

export const writeRate = (p: Price, ttl: Ttl) => p.input * (ttl === '1h' ? 2 : 1.25)

/** What a request cost, at list price; null for an unknown model. */
export function costOf(s: Sample, ttl: Ttl): number | null {
  const p = priceOf(s.model)
  if (!p) return null
  return (s.read * p.read + s.write * writeRate(p, ttl) + s.fresh * p.input + s.output * p.output) / 1e6
}

/** What it would have cost with no cache at all. */
export function uncachedCostOf(s: Sample): number | null {
  const p = priceOf(s.model)
  if (!p) return null
  return (promptTokens(s) * p.input + s.output * p.output) / 1e6
}

/** Sending `tokens` of prompt again: cold (rewritten) and warm (read). */
export function sendCost(model: string, tokens: number, ttl: Ttl): { cold: number; warm: number } | null {
  const p = priceOf(model)
  if (!p) return null
  return { cold: (tokens * writeRate(p, ttl)) / 1e6, warm: (tokens * p.read) / 1e6 }
}

// ---- TTL --------------------------------------------------------------------

export type CacheEnv = { enable1h?: string; force5m?: string; ttlVar?: string; disableAll?: string }
export type Account = 'subscription' | 'credits' | 'other'

const asTtl = (v: unknown): Ttl | undefined => (v === '5m' || v === '1h' ? v : undefined)

export function decideTtl(option: unknown, env: CacheEnv, setting: unknown, account: Account): { ttl: Ttl; source: string } {
  const pinned = asTtl(option)
  if (pinned) return { ttl: pinned, source: 'the mod option' }
  if (isOn(env.force5m)) return { ttl: '5m', source: 'FORCE_PROMPT_CACHING_5M' }
  const v = asTtl(env.ttlVar)
  if (v) return { ttl: v, source: 'CLAUDE_CODE_PROMPT_CACHE_TTL' }
  const s = asTtl(setting)
  if (s) return { ttl: s, source: 'the promptCacheTtl setting' }
  if (isOn(env.enable1h)) return { ttl: '1h', source: 'ENABLE_PROMPT_CACHING_1H' }
  if (account === 'subscription') return { ttl: '1h', source: 'Claude subscription' }
  return { ttl: '5m', source: account === 'credits' ? 'usage credits' : 'default' }
}

export function accountOf(windows: readonly { kind: string; percentUsed: number }[]): Account {
  const plan = windows.filter(w => w.kind === 'five_hour' || w.kind === 'seven_day')
  if (plan.length === 0) return 'other'
  return plan.some(w => w.percentUsed >= 100) ? 'credits' : 'subscription'
}

const SLACK = 10_000

/** What request timing proves about the lifetime (a hit after >5 min means 1h). */
export function observeTtl(prev: Sample | undefined, cur: Sample, known: Ttl | null): Ttl | null {
  if (!prev || prev.read + prev.write === 0 || cur.model !== prev.model) return known
  const gap = cur.startedAt - prev.startedAt
  if (gap <= ttlMs('5m') + SLACK) return known
  if (cur.read >= promptTokens(prev) * 0.5) return '1h'
  if (known === '1h') return known
  const lapsed = cur.write > 0 && promptTokens(cur) >= promptTokens(prev) * 0.7 && gap < ttlMs('1h') + SLACK
  return lapsed ? '5m' : known
}

/** Why a request wrote the cache instead of reading it; undefined if it did not miss. */
export function missReason(prev: Sample | undefined, cur: Sample, ttl: Ttl): string | undefined {
  if (!prev) return undefined
  const before = promptTokens(prev)
  if (before === 0 || promptTokens(cur) < before * 0.7) return undefined
  if (cur.read >= before * 0.5 || cur.write === 0) return undefined
  if (cur.model !== prev.model) return `model changed (${prev.model} → ${cur.model})`
  if (cur.startedAt - prev.startedAt > ttlMs(ttl)) return `the ${ttl} cache had expired`
  return 'the prefix changed (effort, tools, system prompt or CLAUDE.md)'
}

// ---- state ------------------------------------------------------------------

export type Kind = 'none' | 'uncached' | 'warm' | 'soon' | 'cold' | 'compacted'

export type View = {
  kind: Kind
  last?: Sample
  leftMs: number
  tokens: number
  miss?: string
  cost?: { cold: number; warm: number } | null
}

export const SOON_MS: Record<Ttl, number> = { '5m': 60_000, '1h': 5 * 60_000 }

export function viewOf(samples: readonly Sample[], ttl: Ttl, now: number, compactedAt: number): View {
  const turns = samples.filter(s => !s.isPing)
  const last = samples[samples.length - 1]
  if (!last) return { kind: 'none', leftMs: 0, tokens: 0 }
  const lastTurn = turns[turns.length - 1]
  const prevTurn = turns[turns.length - 2]
  const tokens = promptTokens(lastTurn ?? last)
  const miss = lastTurn ? missReason(prevTurn, lastTurn, ttl) : undefined
  const cost = sendCost(last.model, tokens, ttl)
  if (compactedAt > last.startedAt) return { kind: 'compacted', last, leftMs: 0, tokens, cost }
  if (last.read + last.write === 0) return { kind: 'uncached', last, leftMs: 0, tokens, cost }
  // the newest request that touched the cache, ping or turn, sets the clock
  const leftMs = Math.max(0, last.startedAt + ttlMs(ttl) - now)
  const kind: Kind = leftMs === 0 ? 'cold' : leftMs <= SOON_MS[ttl] ? 'soon' : 'warm'
  return { kind, last, leftMs, tokens, miss, cost }
}

// ---- formatting ---------------------------------------------------------------

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function fmtClock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const fmtUsd = (usd: number | null | undefined) =>
  usd == null ? 'n/a' : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`

export function bar(ratio: number, width: number): string {
  const n = Math.round(Math.min(1, Math.max(0, ratio)) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

/** "90m", "2h", "2h30m" → ms; null when it does not parse. */
export function parseDuration(text: string): number | null {
  const s = text.replace(/\s+/g, '').toLowerCase()
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(s)
  if (!m || (!m[1] && !m[2])) return null
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000 || null
}
