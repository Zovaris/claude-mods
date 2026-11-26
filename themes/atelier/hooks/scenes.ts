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
import { clamp, dots, rng, GRAIN, H, type Ink, inkCss, noise, smooth, type Tone, W } from './dither'

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
  rose: {
    label: 'Rose',
    accent: '#e58aa0',
    ink: { dim: { dark: '#5c2f3a', light: '#f1cbd4' }, lit: { dark: '#e58aa0', light: '#cc6680' }, hot: { dark: '#fbd6df', light: '#8c2f48' } },
  },
  amber: {
    label: 'Amber',
    accent: '#e3a857',
    ink: { dim: { dark: '#5e4320', light: '#f1d9b4' }, lit: { dark: '#e3a857', light: '#c98a32' }, hot: { dark: '#fbe3bd', light: '#7c5212' } },
  },
  teal: {
    label: 'Teal',
    accent: '#4fb8b0',
    ink: { dim: { dark: '#1f4643', light: '#c3e3e0' }, lit: { dark: '#4fb8b0', light: '#2f9890' }, hot: { dark: '#c8f0ec', light: '#155c56' } },
  },
  violet: {
    label: 'Violet',
    accent: '#a98be8',
    ink: { dim: { dark: '#3d325e', light: '#dcd1f5' }, lit: { dark: '#a98be8', light: '#8a68d6' }, hot: { dark: '#e5dcff', light: '#4a2f99' } },
  },
  crimson: {
    label: 'Crimson',
    accent: '#e5533a',
    ink: { dim: { dark: '#5a2018', light: '#f2c1b6' }, lit: { dark: '#e5533a', light: '#cc3f27' }, hot: { dark: '#ffc4b4', light: '#7f1d0f' } },
  },
  slate: {
    label: 'Slate',
    accent: '#8fa3b8',
    ink: { dim: { dark: '#323a44', light: '#d3dae2' }, lit: { dark: '#8fa3b8', light: '#62778d' }, hot: { dark: '#e3ebf3', light: '#2c3a49' } },
  },
}

const BG = { dark: ['#1a1918', '#262624'], light: ['#faf9f5', '#f0eee6'] }

const TONES: Tone[] = [
  { cls: 'dim', from: 0 },
  { cls: 'lit', from: 0.5 },
  { cls: 'hot', from: 0.86 },
]

/** The dots don't depend on the tint, so each scene is dithered once and recolored after. */
const memo = new Map<string, string>()
function cached(key: string, make: () => string): string {
  let v = memo.get(key)
  if (v === undefined) memo.set(key, (v = make()))
  return v
}

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
  const paths = cached(`ember:${seed}`, () => dots(emberField(seed), TONES).paths)
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
  const paths = cached(`beam:${seed}`, () => dots(beamField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Fractal noise from a few octaves of value noise, about [0, 1]. */
function fbm(seed: number) {
  const n = noise(seed)
  // each octave turned a different way, so the value-noise grid never lines up into squares
  const rot = [0.5, 1.7, 2.6, 4.1].map(a => [Math.cos(a), Math.sin(a)] as const)
  const amp = [0.5, 0.27, 0.15, 0.08]
  return (x: number, y: number) =>
    rot.reduce((v, [c, s], i) => {
      const k = 2.03 ** i
      return v + amp[i]! * n((x * c - y * s) * k + i * 17.3, (x * s + y * c) * k + i * 5.1)
    }, 0)
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
  const paths = cached(`dunes:${seed}`, () => dots(dunesField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/**
 * Nebula: a band of soft puffs of gas sweeping in from the top-right, with
 * sparse stars. Gaussian puffs, not grid noise, so no edge ever squares off;
 * a slow sine ripple tears the rim into wisps.
 */
export function nebulaField(seed = 11) {
  const rand = rng(seed)
  const puffs = Array.from({ length: 34 }, () => {
    const t = rand()
    const x = W * (1.05 - 0.95 * t) + (rand() - 0.5) * 220
    const y = H * (0.02 + 0.7 * t) + (rand() - 0.5) * 200
    const r = 60 + 150 * rand() * (1.1 - t * 0.6)
    return { x, y, r2: r * r, a: (0.25 + 0.5 * rand()) * (1 - t * 0.55) }
  })
  const star = stars(seed, 900)
  return (x: number, y: number) => {
    let gas = 0
    for (const p of puffs) {
      const d2 = (x - p.x) ** 2 + (y - p.y) ** 2
      if (d2 < p.r2 * 9) gas += p.a * Math.exp(-d2 / (2 * p.r2))
    }
    const tear = 0.82 + 0.18 * Math.sin(x / 53 + 2 * Math.sin(y / 97)) * Math.sin(y / 41 + 1.3 * Math.sin(x / 113))
    const v = Math.pow(smooth(0.2, 1.7, gas * tear), 1.6) * 0.66
    const s = star(Math.round(x), Math.round(y)) ? 0.92 : 0
    return clamp(Math.max(v, s))
  }
}

export function nebulaSvg(tint = 'clay', seed = 11): string {
  const paths = cached(`nebula:${seed}`, () => dots(nebulaField(seed), TONES).paths)
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
  const paths = cached(`tide:${seed}`, () => dots(tideField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Orbit: a small planet high on the left, with thin tilted rings of dots around it. */
export function orbitField(seed = 17) {
  const n = noise(seed)
  const c = { x: 560, y: 360, r: 62 }
  const tilt = -0.32
  const [ct, st] = [Math.cos(tilt), Math.sin(tilt)]
  return (x: number, y: number) => {
    const dx = x - c.x
    const dy = y - c.y
    const d = Math.hypot(dx, dy)
    const disk = d < c.r ? 0.35 + 0.6 * smooth(c.r, -c.r * 0.4, dx + dy * 0.6) : 0
    const u = dx * ct + dy * st
    const v = (-dx * st + dy * ct) / 0.28
    const e = Math.hypot(u, v)
    const behind = v < 0 && d < c.r * 1.05
    let ring = 0
    for (const [rr, a] of [[150, 0.75], [205, 0.45], [320, 0.22]] as const) ring = Math.max(ring, a * Math.exp(-(((e - rr) / 16) ** 2)))
    const halo = 0.22 * Math.pow(1 - smooth(c.r, 300, d), 2)
    return clamp(Math.max(disk, behind ? 0 : ring * (0.7 + 0.6 * n(x / 40, y / 40)), halo))
  }
}

export function orbitSvg(tint = 'clay', seed = 17): string {
  const paths = cached(`orbit:${seed}`, () => dots(orbitField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Aurora: tall soft curtains hanging from the top, swaying, fading downward. */
export function auroraField(seed = 23) {
  const n = noise(seed)
  return (x: number, y: number) => {
    const sway = x + 90 * Math.sin(y / 260 + x / 700) + 40 * Math.sin(y / 90 + 1.3)
    const folds = Math.pow(0.5 + 0.5 * Math.sin(sway / 46 + 3 * Math.sin(sway / 310)), 3)
    const band = smooth(0, 160, y) * Math.pow(1 - smooth(120, 640 + 120 * Math.sin(x / 420), y), 1.4)
    const across = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(x / 520 + 0.8), 1.5)
    return clamp(folds * band * across * (0.8 + 0.4 * n(sway / 24, y / 300)) * 0.85)
  }
}

export function auroraSvg(tint = 'clay', seed = 23): string {
  const paths = cached(`aurora:${seed}`, () => dots(auroraField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

// ---- silhouettes ---------------------------------------------------------
// These scenes are backlit: the light is dithered, and the figure in front of
// it is the dark left empty, with a thin rim where it meets the light.

type Pt = readonly [number, number]

function inPoly(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segDist(x: number, y: number, a: Pt, b: Pt): number {
  const [ax, ay] = a
  const [bx, by] = b
  const t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay))
}

/** The light behind a silhouette, minus the silhouette, plus a rim and any lit marks. */
function backlit(light: (x: number, y: number) => number, solid: (x: number, y: number) => boolean, lit: (x: number, y: number) => number = () => 0) {
  return (x: number, y: number) => {
    if (solid(x, y)) {
      const near = !solid(x, y - 4) && !solid(x, y - 8)
      return clamp(Math.max(lit(x, y), near ? light(x, y) * 0.55 : 0))
    }
    return light(x, y)
  }
}

/** Castle: a keep with towers on a crag, under a huge low moon, two windows lit. */
export function castleField(seed = 29) {
  const n = noise(seed)
  const star = stars(seed, 1400)
  const moon = { x: 1220, y: 430, r: 230 }
  const towers: { x: number; w: number; top: number; roof: number }[] = [
    { x: 1010, w: 70, top: 520, roof: 120 },
    { x: 1130, w: 95, top: 380, roof: 170 },
    { x: 1280, w: 60, top: 560, roof: 95 },
    { x: 1390, w: 80, top: 470, roof: 130 },
  ]
  const crag = (x: number) => 780 - 140 * Math.exp(-(((x - 1220) / 330) ** 2)) + 22 * Math.sin(x / 47) + 14 * Math.sin(x / 13)
  const solid = (x: number, y: number) => {
    if (y > crag(x)) return true
    if (x > 980 && x < 1480 && y > 640 && !(y < 652 && Math.floor(x / 18) % 2 === 0)) return true
    for (const t of towers) {
      const half = t.w / 2
      if (Math.abs(x - t.x) < half && y > t.top) return true
      const rise = (y - (t.top - t.roof)) / t.roof
      if (rise > 0 && rise <= 1 && Math.abs(x - t.x) < (half + 8) * rise) return true
    }
    return false
  }
  const windows = (x: number, y: number) =>
    (Math.abs(x - 1130) < 7 && Math.abs(y - 450) < 12) || (Math.abs(x - 1390) < 6 && Math.abs(y - 540) < 10) ? 0.95 : 0
  const light = (x: number, y: number) => {
    const d = Math.hypot(x - moon.x, y - moon.y)
    const disk = d < moon.r ? 0.62 + 0.25 * n(x / 60, y / 60) : 0
    const glow = 0.5 * Math.pow(1 - smooth(moon.r, moon.r * 3.2, d), 1.8)
    const mist = 0.3 * Math.exp(-(((y - 800) / 60) ** 2)) * (0.6 + 0.8 * n(x / 120, y / 40))
    return clamp(Math.max(disk, glow, mist, star(Math.round(x), Math.round(y)) ? 0.9 : 0))
  }
  return backlit(light, solid, windows)
}

export function castleSvg(tint = 'clay', seed = 29): string {
  const paths = cached(`castle:${seed}`, () => dots(castleField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Warrior: a lone figure with a planted greatsword and a torn cape, on a ridge before a red sun. */
export function warriorField(seed = 31) {
  const n = noise(seed)
  const sun = { x: 1340, y: 560, r: 300 }
  const body: [Pt, Pt, number][] = [
    [[1340, 470], [1340, 470], 26], // head
    [[1340, 505], [1336, 640], 40], // torso
    [[1300, 520], [1380, 520], 30], // shoulders
    [[1328, 640], [1312, 800], 20], // left leg
    [[1350, 640], [1372, 800], 20], // right leg
    [[1310, 540], [1395, 610], 13], // arm to the hilt
    [[1395, 560], [1398, 600], 12],
  ]
  const cape: Pt[] = [[1300, 505], [1380, 505], [1300, 650], [1255, 790], [1230, 760], [1210, 800], [1185, 770]]
  const sword = { top: [1398, 540] as Pt, tip: [1404, 830] as Pt }
  const ridge = (x: number) => 815 + 30 * Math.sin(x / 260) + 10 * Math.sin(x / 37)
  const solid = (x: number, y: number) => {
    if (y > ridge(x)) return true
    if (body.some(([a, b, r]) => segDist(x, y, a, b) < r)) return true
    if (inPoly(cape, x, y) && n(x / 14, y / 14) > 0.25) return true
    if (segDist(x, y, sword.top, sword.tip) < 6) return true
    if (Math.abs(y - 560) < 5 && Math.abs(x - 1398) < 34) return true
    // horns on the helm
    if (segDist(x, y, [1322, 458], [1300, 418]) < 6 || segDist(x, y, [1358, 458], [1380, 418]) < 6) return true
    return false
  }
  const light = (x: number, y: number) => {
    const d = Math.hypot(x - sun.x, y - sun.y)
    const disk = d < sun.r ? 0.55 + 0.2 * Math.pow(1 - d / sun.r, 0.6) : 0
    const glow = 0.48 * Math.pow(1 - smooth(sun.r, sun.r * 2.6, d), 2)
    const ash = n(x / 7, y / 7) > 0.985 && d < sun.r * 2.2 ? 0.7 : 0
    return clamp(Math.max(disk, glow, ash))
  }
  return backlit(light, solid)
}

export function warriorSvg(tint = 'crimson', seed = 31): string {
  const paths = cached(`warrior:${seed}`, () => dots(warriorField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}

/** Boulevard: a striped sun setting behind a city skyline, palms along the shore. */
export function boulevardField(seed = 37) {
  const rand = rng(seed)
  const sun = { x: 960, y: 620, r: 270 }
  const blocks: { x0: number; x1: number; top: number }[] = []
  for (let x = 120; x < 1820; ) {
    const w = 40 + rand() * 90
    const tall = Math.exp(-(((x - 960) / 520) ** 2))
    blocks.push({ x0: x, x1: x + w, top: 760 - (60 + rand() * 150) * (0.5 + tall) })
    x += w + rand() * 8
  }
  const shore = 790
  const palms: { x: number; h: number; lean: number }[] = [
    { x: 260, h: 360, lean: 60 },
    { x: 380, h: 300, lean: -40 },
    { x: 1560, h: 380, lean: -70 },
    { x: 1700, h: 310, lean: 45 },
  ]
  const palm = (x: number, y: number) =>
    palms.some(p => {
      const top: Pt = [p.x + p.lean, shore - p.h]
      if (segDist(x, y, [p.x, shore], top) < 7) return true
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI + (k / 6) * Math.PI
        const tip: Pt = [top[0] + Math.cos(a) * 130, top[1] + Math.sin(a) * 34 + 50]
        const mid: Pt = [top[0] + Math.cos(a) * 70, top[1] + Math.sin(a) * 40]
        if (segDist(x, y, top, mid) < 5 || segDist(x, y, mid, tip) < 4) return true
      }
      return false
    })
  const solid = (x: number, y: number) =>
    (y > shore && y < shore + 14) || blocks.some(b => x >= b.x0 && x < b.x1 && y > b.top && y <= shore) || palm(x, y)
  const light = (x: number, y: number) => {
    const d = Math.hypot(x - sun.x, y - sun.y)
    const stripe = y > sun.y - 40 && Math.floor((y - sun.y + 40) / 22) % 2 === 1
    const disk = d < sun.r && !stripe ? 0.5 + 0.4 * smooth(sun.y + sun.r, sun.y - sun.r, y) : 0
    const glow = 0.42 * Math.pow(1 - smooth(sun.r, sun.r * 2.7, d), 2)
    const dusk = y < shore ? 0.56 * Math.exp(-(((y - shore + 150) / 260) ** 2)) * (0.55 + 0.45 * Math.exp(-(((x - sun.x) / 900) ** 2))) : 0
    const water = y > shore + 14 ? 0.55 * Math.exp(-(((x - sun.x) / 200) ** 2)) * (Math.floor(y / 9) % 3 === 0 ? 1 : 0.2) * Math.exp(-(y - shore) / 180) : 0
    return clamp(Math.max(disk, glow, dusk, water))
  }
  return backlit(light, solid)
}

export function boulevardSvg(tint = 'rose', seed = 37): string {
  const paths = cached(`boulevard:${seed}`, () => dots(boulevardField(seed), TONES).paths)
  return frame(`<g class="light">${paths}</g>`, '.light', TINTS[tint]!.ink)
}
