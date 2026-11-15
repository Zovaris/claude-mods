/**
 * The Dunes scene: a red desert drawn in ASCII on a 160 × 60 character grid.
 *
 * Three ranges of dunes, far to near, each shaded the way sand is lit by a low
 * sun on the right: the slope that faces it is dense and bright (`=+*#%`), the
 * one that faces away sparse and dark (`.:-`), ridges drawn as `/ \ _`, and the
 * near range rippled by the wind. The sky is an ordered dither of dots that
 * thickens toward the horizon and around the sun, a disk of `@`s sinking
 * behind the far range. Sand blows across the ridges and a few stars twinkle.
 *
 * Each color is a class, so light mode (noon) only recolors; every run of one
 * class on a row is one <text>, stretched to its cells with `textLength`, so
 * the grid stays aligned in any monospace font. Seeded: always the same desert.
 */

export const W = 1920
export const H = 1080
export const COLS = 160
export const ROWS = 60
const CW = W / COLS
const CH = H / ROWS

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every class and its color, dusk (dark) and noon (light). */
export const INK: Record<string, { dark: string; light: string }> = {
  sky: { dark: '#4a1a17', light: '#e9cdbf' },
  glow: { dark: '#7a2a1e', light: '#e2b29c' },
  star: { dark: '#f0c4b0', light: '#f0c4b0' },
  sun: { dark: '#ff9a62', light: '#e8643a' },
  rim: { dark: '#ff5f3a', light: '#d9502e' },
  farLit: { dark: '#93372b', light: '#ddaa96' },
  farDim: { dark: '#4a1915', light: '#e8c4b4' },
  midLit: { dark: '#c4472e', light: '#cc7a60' },
  midDim: { dark: '#5f1f19', light: '#dca48e' },
  nearLit: { dark: '#ff6a3d', light: '#b44a30' },
  nearDim: { dark: '#7a2418', light: '#c97a62' },
  crest: { dark: '#ffb48c', light: '#8e2c1a' },
  wind: { dark: '#ffa07e', light: '#a8452c' },
}

export const SAND = { dark: { top: '#120605', horizon: '#2a0d09', sun: '#4d170e' }, light: { top: '#f8efe8', horizon: '#f4e2d6', sun: '#f6d2bd' } }

const SUN = { col: 120, row: 30, r: 7.4 }

/** Bayer 4×4, for an ordered dither that reads as a gradient. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)

/** A dune: one wave of it, with a long gentle back rising to the right and a steep slip face. */
type Dune = [len: number, phase: number, share: number]
type Range = { base: number; amp: number; dunes: Dune[]; swell: number; lit: string; dim: string; light: number; ripple: number }

/** Far to near. */
const RANGES: Range[] = [
  { base: 33.5, amp: 3.4, dunes: [[52, 0.15, 1], [83, 0.6, 0.5]], swell: 1.2, lit: 'farLit', dim: 'farDim', light: 0.6, ripple: 0 },
  { base: 41.5, amp: 5, dunes: [[68, 0.45, 1], [110, 0.1, 0.45]], swell: 1.6, lit: 'midLit', dim: 'midDim', light: 0.8, ripple: 0.1 },
  { base: 51.5, amp: 7.5, dunes: [[96, 0.8, 1], [150, 0.35, 0.4]], swell: 2, lit: 'nearLit', dim: 'nearDim', light: 1, ripple: 0.2 },
]

const PEAK = 0.74
/** 0 → 1 → 0 over one wave: a slow rise to the crest at PEAK, then a fast fall. */
function profile(x: number): number {
  const p = x - Math.floor(x)
  return p < PEAK ? (Math.sin((p / PEAK - 0.5) * Math.PI) + 1) / 2 : (Math.cos(((p - PEAK) / (1 - PEAK)) * Math.PI) + 1) / 2
}

/** The ridge of a range at a (fractional) column, in rows: smaller is higher. */
function ridge(r: Range, c: number): number {
  const total = r.dunes.reduce((a, d) => a + d[2], 0)
  const y = r.dunes.reduce((a, [len, ph, share]) => a + share * profile(c / len + ph), 0) / total
  return r.base - y * r.amp - r.swell * Math.sin(c / 41 + r.base)
}

const LIT_RAMP = ' .:-=+*#%@'
const DIM_RAMP = ' .,:;-~'

type Cell = { ch: string; ink: string }

export function grid(seed: number): Cell[][] {
  const rand = rng(seed)
  const cells: Cell[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ ch: ' ', ink: '' })))
  const PAD = 3
  const ridges = RANGES.map(r => Array.from({ length: COLS + PAD * 2 }, (_, i) => ridge(r, i - PAD)))
  const at = (i: number, c: number) => ridges[i]![c + PAD]!

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      // The nearest range whose ridge is above this cell owns it.
      let owner = -1
      for (let i = RANGES.length - 1; i >= 0; i--) {
        if (row + 0.5 >= at(i, col)) {
          owner = i
          break
        }
      }
      const cell = cells[row]![col]!
      if (owner < 0) {
        // Sky: dots thicker toward the horizon and the sun, stars up high.
        const toHorizon = Math.max(0, 1 - (33 - row) / 16)
        const ds = Math.hypot((col - SUN.col) * 0.55, row - SUN.row)
        if (ds <= SUN.r) {
          const edge = ds > SUN.r - 1.1
          cell.ch = edge ? 'o' : ds < SUN.r * 0.55 ? '@' : '0'
          cell.ink = edge ? 'rim' : 'sun'
          // Bands across the lower half, as on a low sun through haze.
          if (!edge && row % 2 === 0 && row > SUN.row + 1) cell.ch = '='
          continue
        }
        const glow = Math.max(0, 1 - ds / 28)
        const p = toHorizon ** 2.2 * 0.26 + glow ** 1.8 * 0.4
        const t = BAYER[(row % 4) * 4 + (col % 4)]!
        if (p > t) {
          cell.ch = p > 0.34 && glow > 0.3 ? ':' : '.'
          cell.ink = glow > 0.3 ? 'glow' : 'sky'
        } else if (row < 24 && rand() < 0.011) {
          cell.ch = rand() < 0.7 ? '.' : rand() < 0.6 ? '+' : '*'
          cell.ink = 'star'
        }
        continue
      }

      const r = RANGES[owner]!
      const y = at(owner, col)
      const depth = row + 0.5 - y
      const step = Math.max(Math.abs(at(owner, col + 1) - y), Math.abs(y - at(owner, col - 1)))
      // Rows per column, smoothed: positive where the ridge falls to the right, toward the sun.
      const slope = (at(owner, col + 3) - at(owner, col - 3)) / 6

      // The ridge itself, as a line; on a steep face it fills the rows it drops.
      if (depth < Math.max(1, step + 0.3)) {
        const local = at(owner, col + 1) - at(owner, col - 1)
        cell.ch = local < -0.6 ? '/' : local > 0.6 ? '\\' : depth < 0.5 ? '-' : '_'
        cell.ink = slope > 0.05 ? 'crest' : r.lit
        continue
      }

      // We see each range from the front, lit by a low sun on the right. A face
      // takes its light from the ridge up and to the right of it, so light and
      // shade meet in diagonals running down-left from each crest.
      const src = col + depth / 0.55
      const s0 = Math.floor(src)
      const at2 = (c: number) => ridge(r, c)
      const facing = Math.max(-1, Math.min(1, ((at2(s0 + 3) - at2(s0 - 3)) / 6) * 3.2))
      const lit = facing > -0.08
      let b = lit ? 0.55 + facing * 0.4 : 0.6 + facing * 0.35
      b *= r.light
      b *= 1 - Math.min(0.55, depth / 18) // fades as it falls into the trough
      // Wind ripples that follow the dune's own shape.
      if (r.ripple) b += r.ripple * Math.sin(depth * 2.3 + src * 0.35)
      // Quieter behind the conversation, in the middle columns.
      b *= 1 - 0.35 * Math.exp(-(((col - 74) / 32) ** 2))
      b += (BAYER[(row % 4) * 4 + (col % 4)]! - 0.5) * 0.14 + (rand() - 0.5) * 0.04
      b = Math.max(0, Math.min(0.999, b))

      const ramp = lit ? LIT_RAMP : DIM_RAMP
      cell.ch = ramp[Math.floor(b * ramp.length)]!
      cell.ink = lit ? r.lit : r.dim
    }
  }
  return cells
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** One <text> per run of a class on a row, from its first cell to its last. */
function textRuns(cells: Cell[][]): string {
  const out: string[] = []
  for (let row = 0; row < ROWS; row++) {
    const line = cells[row]!
    const inks = new Set(line.map(c => c.ink).filter(Boolean))
    for (const ink of inks) {
      let first = -1
      let last = -1
      line.forEach((c, i) => {
        if (c.ink === ink && c.ch !== ' ') {
          if (first < 0) first = i
          last = i
        }
      })
      if (first < 0) continue
      const s = line
        .slice(first, last + 1)
        .map(c => (c.ink === ink ? c.ch : ' '))
        .join('')
      out.push(
        `<text class="${ink}" x="${(first * CW).toFixed(1)}" y="${((row + 0.78) * CH).toFixed(1)}" textLength="${(s.length * CW).toFixed(1)}">${esc(s)}</text>`,
      )
    }
  }
  return out.join('')
}

/** Sand blowing off the ridges: sparse marks in two copies, sliding left forever. */
function windRows(seed: number): string {
  const rand = rng(seed)
  const marks = ['~', '-', '`', ',', '.', '~']
  const rows: string[] = []
  for (const r of RANGES.slice(1)) {
    for (let k = -3; k <= 1; k++) {
      const row = Math.round(r.base + k - r.amp * 0.3)
      let s = ''
      for (let c = 0; c < COLS; c++) s += rand() < 0.035 ? marks[Math.floor(rand() * marks.length)] : ' '
      const y = ((row + 0.78) * CH).toFixed(1)
      for (const x0 of [0, W]) rows.push(`<text x="${x0}" y="${y}" textLength="${W}">${esc(s)}</text>`)
    }
  }
  return rows.join('')
}

export function sceneSvg(seed = 5): string {
  const cells = grid(seed)
  const ink = (mode: 'dark' | 'light') =>
    Object.entries(INK)
      .map(([k, v]) => `.${k}{fill:${v[mode]}}`)
      .join('')

  const style =
    `text{font:${(CH * 0.92).toFixed(1)}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}` +
    ink('dark') +
    `.t0{stop-color:${SAND.dark.top}}.t1{stop-color:${SAND.dark.horizon}}.g0{stop-color:${SAND.dark.sun}}` +
    `.wind{fill:${INK.wind!.dark};opacity:.55;animation:blow 70s linear infinite}` +
    `.sun,.rim{animation:shimmer 9s ease-in-out infinite alternate}` +
    `.star{animation:twinkle 7s ease-in-out infinite alternate}` +
    `@keyframes blow{from{transform:translateX(0)}to{transform:translateX(-${W}px)}}` +
    `@keyframes shimmer{from{opacity:.82}to{opacity:1}}` +
    `@keyframes twinkle{from{opacity:.35}to{opacity:1}}` +
    `@media (prefers-color-scheme:light){` +
    ink('light') +
    `.t0{stop-color:${SAND.light.top}}.t1{stop-color:${SAND.light.horizon}}.g0{stop-color:${SAND.light.sun}}` +
    `.wind{fill:${INK.wind!.light};opacity:.45}.star{display:none}}` +
    `@media (prefers-reduced-motion:reduce){.wind,.sun,.rim,.star{animation:none}}`

  const defs =
    `<linearGradient id="air" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="t0"/><stop offset=".55" class="t1"/><stop offset="1" class="t0"/></linearGradient>` +
    `<radialGradient id="warm" gradientUnits="userSpaceOnUse" cx="${SUN.col * CW}" cy="${SUN.row * CH}" r="760">` +
    `<stop offset="0" class="g0"/><stop offset="1" class="g0" stop-opacity="0"/></radialGradient>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMax slice">` +
    `<style>${style}</style>` +
    `<defs>${defs}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#air)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#warm)"/>` +
    `<g>${textRuns(cells)}</g>` +
    `<g class="wind">${windRows(seed + 1)}</g>` +
    `</svg>`
  )
}
