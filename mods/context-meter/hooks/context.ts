/**
 * The pure half of context-meter: colors per category, the compaction point
 * and the state, no `$`.
 */
import type { Category, Snapshot } from '../types'
import type { Part, Tone } from './slim'

/** A color per category, by what its name says: raw for the SVG, a theme key for text. */
const STYLE: [RegExp, { hex: string; theme: string }][] = [
  [/system prompt/i, { hex: '#a98be8', theme: 'merged' }],
  [/mcp/i, { hex: '#e0a84e', theme: 'warning' }],
  [/tool/i, { hex: '#5fb3d4', theme: 'ide' }],
  [/memory/i, { hex: '#7cd4a8', theme: 'success' }],
  [/skill/i, { hex: '#f2a37a', theme: 'claude' }],
  [/agent/i, { hex: '#e88ac0', theme: 'remember' }],
  [/message/i, { hex: '#c9c4d6', theme: 'text' }],
]
const FALLBACK = { hex: '#8a8597', theme: 'inactive' }

export const styleOf = (name: string) => STYLE.find(([re]) => re.test(name))?.[1] ?? FALLBACK

export const usedCategories = (s: Snapshot): Category[] =>
  s.categories.filter(c => c.kind === 'used' && c.tokens > 0).sort((a, b) => b.tokens - a.tokens)

export const bufferTokens = (s: Snapshot) => s.categories.filter(c => c.kind === 'buffer').reduce((a, c) => a + c.tokens, 0)

/** Where auto-compact kicks in, as a share of the window; null without a buffer. */
export function compactAt(s: Snapshot): number | null {
  const buffer = bufferTokens(s)
  if (buffer <= 0 || s.rawMaxTokens <= 0) return null
  return Math.max(0, (s.rawMaxTokens - buffer) / s.rawMaxTokens)
}

/** The bar's parts: each used category in its color, in window shares. */
export function partsOf(s: Snapshot): Part[] {
  const max = Math.max(1, s.rawMaxTokens)
  return usedCategories(s).map(c => {
    const st = styleOf(c.name)
    return { share: c.tokens / max, tone: 'muted' as Tone, hex: st.hex, theme: st.theme }
  })
}

export type ContextState = { label: string; tone: Tone }

/** roomy · filling · getting full · compacts soon · over the line */
export function contextState(s: Snapshot): ContextState {
  const used = s.totalTokens / Math.max(1, s.rawMaxTokens)
  const line = compactAt(s) ?? 1
  const toLine = used / line
  if (toLine >= 1) return { label: 'compacting next', tone: 'error' }
  if (toLine >= 0.9) return { label: 'compacts soon', tone: 'error' }
  if (toLine >= 0.75) return { label: 'getting full', tone: 'warning' }
  if (toLine >= 0.5) return { label: 'filling', tone: 'success' }
  return { label: 'roomy', tone: 'success' }
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export const pct = (n: number) => `${n < 1 && n > 0 ? n.toFixed(1) : Math.round(n)}%`

/** A path with the home folder as `~` and only its last parts when long. */
export function shortPath(path: string, home?: string): string {
  const p = home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
  const parts = p.split('/')
  return parts.length > 4 ? `…/${parts.slice(-3).join('/')}` : p
}
