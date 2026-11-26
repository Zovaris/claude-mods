/**
 * Ember and Beam: two quiet dithered scenes on Claude's warm grays, in one of
 * a few tints (clay by default).
 *
 * Both are mostly empty dark (ivory in light mode), with one source of light
 * printed as a dot dither: Ember a low sun rising out of the bottom-right
 * corner with a thin rim of horizon, Beam one streak of light crossing from
 * the left edge that thins to a spark. Film grain sits on top, and the light
 * breathes slowly unless motion is reduced.
 */
import { clamp, dots, GRAIN, H, type Ink, inkCss, noise, smooth, type Tone, W } from './dither'

/** Each tint's three inks, faint to bright, for dark and light mode. */
export const TINTS: Record<string, { label: string; accent: string; ink: Ink }> = {
  clay: {
    label: 'Clay',
    accent: '#d97757',
    ink: { dim: { dark: '#6b3a2a', light: '#ecc5b4' }, lit: { dark: '#d97757', light: '#d97757' }, hot: { dark: '#f2c2a8', light: '#a8492a' } },
  },
  cobalt: {
    label: 'Cobalt',
    accent: '#6f8cf6',
    ink: { dim: { dark: '#2c3a6e', light: '#c6d0f4' }, lit: { dark: '#6f8cf6', light: '#4f6de6' }, hot: { dark: '#cdd7ff', light: '#22379a' } },
  },
  sage: {
    label: 'Sage',
    accent: '#8fb77e',
    ink: { dim: { dark: '#36452f', light: '#cfdcc5' }, lit: { dark: '#8fb77e', light: '#6f9a5e' }, hot: { dark: '#dcebd2', light: '#3f5f33' } },
  },
  ivory: {
    label: 'Ivory',
    accent: '#c9b99a',
    ink: { dim: { dark: '#45423b', light: '#d9d4c7' }, lit: { dark: '#b8b2a3', light: '#8a8475' }, hot: { dark: '#f0eee6', light: '#3d3a33' } },
  },
}

const BG = { dark: ['#1a1918', '#262624'], light: ['#faf9f5', '#f0eee6'] }

const TONES: Tone[] = [
  { cls: 'dim', from: 0 },
  { cls: 'lit', from: 0.5 },
  { cls: 'hot', from: 0.86 },
]

function frame(body: string, breathe: string, ink: Ink): string {
  const style =
    inkCss(ink, 'dark') +
    `.b0{stop-color:${BG.dark[0]}}.b1{stop-color:${BG.dark[1]}}.grain{opacity:.07}` +
    `${breathe}{animation:breathe 14s ease-in-out infinite alternate}` +
    `@keyframes breathe{from{opacity:.78}to{opacity:1}}` +
    `@media (prefers-color-scheme:light){${inkCss(ink, 'light')}.b0{stop-color:${BG.light[0]}}.b1{stop-color:${BG.light[1]}}.grain{opacity:.05}}` +
    `@media (prefers-reduced-motion:reduce){${breathe}{animation:none}}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="b0"/><stop offset="1" class="b1"/></linearGradient>${GRAIN}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    body +
    `<rect class="grain" width="${W}" height="${H}" filter="url(#grain)"/>` +
    `</svg>`
  )
}

export const EMBER = { cx: 1640, cy: 1260, r: 900, rim: 700 }

/** Light of the Ember scene at a point. */
export function emberField(seed = 7) {
  const n = noise(seed)
  return (x: number, y: number) => {
    const d = Math.hypot(x - EMBER.cx, y - EMBER.cy)
    const glow = 0.78 * Math.pow(1 - smooth(0, EMBER.r, d), 1.9)
    const grain = 0.7 + 0.6 * n(x / 55, y / 55)
    const rim = Math.exp(-(((d - EMBER.rim) / 7) ** 2)) * smooth(EMBER.cy, EMBER.cy - EMBER.rim * 0.9, y)
    return clamp(Math.max(glow * grain, rim * 0.95))
  }
}

export function emberSvg(tint = 'clay', seed = 7): string {
  const { paths } = dots(emberField(seed), TONES)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

export const BEAM = { y: 0.6 * H, end: 0.68 * W }

/** Light of the Beam scene at a point. */
export function beamField(seed = 13) {
  const n = noise(seed)
  return (x: number, y: number) => {
    const t = x / BEAM.end
    const w = 4 + 120 * Math.pow(clamp(1 - t), 2.4)
    const fade = 0.55 + 0.6 * Math.pow(clamp(1 - t), 0.7)
    const streak = Math.exp(-(((y - BEAM.y) / w) ** 2)) * fade
    const dx = x - BEAM.end
    const dy = y - BEAM.y
    const spark = Math.pow(1 - smooth(0, 90, Math.hypot(dx, dy * 1.4)), 1.6) + 0.7 * Math.exp(-((dy / 3) ** 2)) * Math.exp(-Math.abs(dx) / 140)
    const halo = 0.45 * Math.pow(1 - smooth(0, 520, Math.hypot(x * 0.55, dy)), 1.6)
    const grain = 0.7 + 0.6 * n(x / 50, y / 30)
    return clamp(Math.max(streak * (t < 1 ? 1 : 0) * grain, spark, halo * grain))
  }
}

export function beamSvg(tint = 'clay', seed = 13): string {
  const { paths } = dots(beamField(seed), TONES)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Fractal noise from a few octaves of value noise, about [0, 1]. */
function fbm(seed: number) {
  const n = noise(seed)
  return (x: number, y: number) => (n(x, y) * 0.55 + n(x * 2.1, y * 2.1) * 0.3 + n(x * 4.3, y * 4.3) * 0.15)
}

/** A star at about one cell in this many, the same every time. */
function stars(seed: number, every: number) {
  return (x: number, y: number) => {
    let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ seed, 0x9e3779b1) >>> 0
    h ^= h >>> 15
    return h % every === 0
  }
}

/** Dunes: three ridges of sand, lit from a low sun on the right, fading into the dark below. */
export const DUNES = { sun: { x: 1480, y: 600, r: 64 } }

export function dunesField(seed = 5) {
  const n = noise(seed)
  const ranges = [
    { base: 690, amp: 70, len: 760, ph: 0.2, lit: 0.42 },
    { base: 800, amp: 95, len: 980, ph: 0.65, lit: 0.6 },
    { base: 930, amp: 120, len: 1260, ph: 0.35, lit: 0.8 },
  ]
  const profile = (p: number) => {
    const f = p - Math.floor(p)
    return f < 0.74 ? (Math.sin((f / 0.74 - 0.5) * Math.PI) + 1) / 2 : (Math.cos(((f - 0.74) / 0.26) * Math.PI) + 1) / 2
  }
  return (x: number, y: number) => {
    const s = DUNES.sun
    const ds = Math.hypot(x - s.x, y - s.y)
    let v = ds < s.r ? 0.95 : 0.3 * Math.pow(1 - smooth(s.r, 520, ds), 2)
    for (const r of ranges) {
      const ridge = r.base - r.amp * profile(x / r.len + r.ph) - 18 * Math.sin(x / 300 + r.base)
      const ahead = r.base - r.amp * profile((x + 6) / r.len + r.ph) - 18 * Math.sin((x + 6) / 300 + r.base)
      if (y < ridge) continue
      const facing = ahead < ridge ? 1 : 0.28
      const depth = y - ridge
      const crest = Math.exp(-((depth / 5) ** 2))
      v = Math.max(0, r.lit * (facing * Math.exp(-depth / 120) * (0.7 + 0.6 * n(x / 40, y / 12)) + crest * 0.5))
    }
    return clamp(v)
  }
}

export function dunesSvg(tint = 'clay', seed = 5): string {
  const { paths } = dots(dunesField(seed), TONES)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Nebula: a band of torn gas sweeping in from the top-right, with sparse stars. */
export function nebulaField(seed = 11) {
  const f = fbm(seed)
  const g = fbm(seed + 1)
  const star = stars(seed, 900)
  return (x: number, y: number) => {
    const wx = x + 160 * (g(x / 380, y / 380) - 0.5)
    const wy = y + 160 * (g(x / 380 + 9, y / 380) - 0.5)
    const line = Math.abs(0.42 * wx + wy - 0.95 * H) / Math.hypot(0.42, 1)
    const band = Math.exp(-((line / 170) ** 2)) * smooth(0, 1100, wx) * 0.95
    const gas = band * Math.pow(f(wx / 260, wy / 260), 1.6) * 1.9
    const s = star(Math.round(x), Math.round(y)) ? 0.92 : 0
    return clamp(Math.max(gas, s))
  }
}

export function nebulaSvg(tint = 'clay', seed = 11): string {
  const { paths } = dots(nebulaField(seed), TONES)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Tide: a few thin swells rolling across the bottom, brighter as they come near. */
export function tideField(seed = 3) {
  const n = noise(seed)
  return (x: number, y: number) => {
    let v = 0
    for (let k = 0; k < 6; k++) {
      const base = 790 + k * 50 + k * k * 4
      const wave = base + (10 + 4 * k) * Math.sin(x / (230 - k * 18) + k * 1.7) + 8 * Math.sin(x / 71 + k)
      const width = 2.5 + k * 0.9
      const strength = 0.28 + k * 0.12
      v = Math.max(v, Math.exp(-(((y - wave) / width) ** 2)) * strength * (0.6 + 0.8 * n(x / 90 + k * 7, k)))
    }
    return clamp(v)
  }
}

export function tideSvg(tint = 'clay', seed = 3): string {
  const { paths } = dots(tideField(seed), TONES)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}
