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

export const EMBER = { cx: 1580, cy: 1200, r: 1120, rim: 700 }

/** Light of the Ember scene at a point. */
export function emberField(seed = 7) {
  const n = noise(seed)
  return (x: number, y: number) => {
    const d = Math.hypot(x - EMBER.cx, y - EMBER.cy)
    const glow = Math.pow(1 - smooth(0, EMBER.r, d), 1.25)
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
