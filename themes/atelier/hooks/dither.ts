/**
 * Ordered dither on a dot grid, drawn as one SVG path per tone.
 *
 * A scene gives a field, light from 0 to 1 at each point of a 1920 × 1080
 * frame. Every cell of the grid lights one square dot when the field beats
 * its 8 × 8 Bayer threshold, so a smooth glow reads as printed dots that thin
 * out toward the dark. Dots are written with relative moves to keep the
 * source small. Seeded: the same scene every time.
 */

export const W = 1920
export const H = 1080

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bayer(n: number): number[][] {
  if (n === 1) return [[0]]
  const m = bayer(n / 2)
  const h = n / 2
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => 4 * m[y % h]![x % h]! + [0, 2, 3, 1][(y < h ? 0 : 2) + (x < h ? 0 : 1)]!),
  )
}

const B8 = bayer(8).map(r => r.map(v => (v + 0.5) / 64))

/** Smooth value noise in about [0, 1], for grain in a field. */
export function noise(seed: number) {
  const rand = rng(seed)
  const size = 64
  const t = Array.from({ length: size * size }, () => rand())
  const at = (x: number, y: number) => t[(((y % size) + size) % size) * size + (((x % size) + size) % size)]!
  const ease = (v: number) => v * v * (3 - 2 * v)
  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = ease(x - x0)
    const fy = ease(y - y0)
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
    return a + (b - a) * fy
  }
}

export const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export type Tone = { cls: string; from: number }

/**
 * The dots for a field, one path per tone. A lit dot takes the last tone whose
 * `from` its light reaches, so the brightest part of a glow can print in a
 * second ink.
 */
export function dots(field: (x: number, y: number) => number, tones: Tone[], cell = 6, dot = 3): { paths: string; count: number } {
  const sq = `h${dot}v${dot}h-${dot}z`
  const runs = tones.map(() => [] as string[])
  let count = 0
  for (let r = 0; r * cell < H; r++) {
    const y = r * cell
    const lastX = tones.map(() => -1)
    for (let c = 0; c * cell < W; c++) {
      const x = c * cell
      const v = field(x + cell / 2, y + cell / 2)
      if (v <= B8[r % 8]![c % 8]!) continue
      let k = -1
      for (let i = 0; i < tones.length; i++) if (v >= tones[i]!.from) k = i
      if (k < 0) continue
      runs[k]!.push(lastX[k]! < 0 ? `M${x} ${y}${sq}` : `m${x - lastX[k]!} 0${sq}`)
      lastX[k] = x
      count++
    }
  }
  return { paths: tones.map((t, i) => (runs[i]!.length ? `<path class="${t.cls}" d="${runs[i]!.join('')}"/>` : '')).join(''), count }
}

/** Faint film grain over the whole frame; drawn once, never animated. */
export const GRAIN =
  `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" stitchTiles="stitch"/>` +
  `<feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0"/></filter>`

export type Ink = Record<string, { dark: string; light: string }>

export function inkCss(ink: Ink, mode: 'dark' | 'light') {
  return Object.entries(ink)
    .map(([k, v]) => `.${k}{fill:${v[mode]}}`)
    .join('')
}
