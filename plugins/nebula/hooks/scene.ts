/**
 * The Nebula scene: a band of gas across the right side of the sky, made of
 * fractal noise (feTurbulence) tinted lilac, rose and a warm peach core, with
 * darker dust carved through it; and clean round stars, thick along the band
 * and sparse elsewhere. Seeded, so the sky is always the same. The middle
 * stays quiet for the conversation; only a few stars twinkle.
 */

const W = 1920
const H = 1080

export const SKY = {
  dark: { base: '#0d0c13' },
  light: { base: '#f3f1f7' },
  lilac: [166, 135, 255],
  rose: [255, 170, 205],
  peach: [255, 214, 168],
  starTints: ['#ffffff', '#f3eeff', '#ffe9d6', '#ffd9e8', '#e6e2ff'],
}

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

/** A gas layer: noise turned into alpha, filled with one color. */
function gasFilter(id: string, rgb: number[], seed: number, freq: string, gain: number, cut: number): string {
  const [r, g, b] = rgb.map(v => ((v ?? 0) / 255).toFixed(3))
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="5" seed="${seed}"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${gain} 0 0 0 ${-cut}"/>` +
    `</filter>`
  )
}

/** Where the band lies: a long soft ellipse, tilted, along the right side. */
const BAND = { cx: 1560, cy: 520, rx: 300, ry: 780, angle: 24 }

/** Whether a point is inside the band, softly: 1 on its spine, 0 outside. */
function bandWeight(x: number, y: number): number {
  const a = (BAND.angle * Math.PI) / 180
  const dx = x - BAND.cx
  const dy = y - BAND.cy
  const u = dx * Math.cos(a) + dy * Math.sin(a)
  const v = -dx * Math.sin(a) + dy * Math.cos(a)
  const d = (u / BAND.rx) ** 2 + (v / BAND.ry) ** 2
  return Math.max(0, 1 - d)
}

export function sceneSvg(seed = 7): string {
  const rand = rng(seed)

  const defs =
    gasFilter('lilac', SKY.lilac, 7, '0.0016 0.0026', 1.9, 0.6) +
    gasFilter('rose', SKY.rose, 21, '0.0022 0.0034', 2.1, 0.85) +
    gasFilter('peach', SKY.peach, 3, '0.0030 0.0040', 2.8, 1.45) +
    gasFilter('dust', [8, 7, 12], 41, '0.0045 0.0060', 2.4, 1.15) +
    // The band's mask: bright on its spine, gone at its edge.
    `<radialGradient id="bandFade" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff" stop-opacity=".75"/><stop offset=".7" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<mask id="band" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    `<ellipse cx="${BAND.cx}" cy="${BAND.cy}" rx="${BAND.rx * 1.7}" ry="${BAND.ry}" transform="rotate(${BAND.angle} ${BAND.cx} ${BAND.cy})" fill="url(#bandFade)"/></mask>` +
    // A second, faint wisp low on the left.
    `<radialGradient id="wispFade" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<mask id="wisp" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    `<ellipse cx="170" cy="980" rx="460" ry="260" transform="rotate(-12 170 980)" fill="url(#wispFade)"/></mask>`

  const full = (filter: string, opacity: number) =>
    `<rect width="${W}" height="${H}" filter="url(#${filter})" opacity="${opacity}"/>`

  const nebula =
    `<g class="nebula">` +
    `<g mask="url(#band)">${full('lilac', 0.95)}${full('rose', 0.85)}${full('peach', 0.8)}${full('dust', 0.6)}</g>` +
    `<g mask="url(#wisp)">${full('lilac', 0.45)}${full('rose', 0.3)}</g>` +
    `</g>`

  // Stars: many small ones along the band, a scattering elsewhere, the middle kept sparse.
  const stars: string[] = []
  const place = (count: number, pick: () => [number, number] | null) => {
    for (let i = 0; i < count; i++) {
      const p = pick()
      if (!p) continue
      const [x, y] = p
      const big = rand()
      const r = big < 0.82 ? 0.45 + rand() * 0.45 : big < 0.97 ? 0.9 + rand() * 0.4 : 1.3 + rand() * 0.5
      const tint = SKY.starTints[Math.floor(rand() * SKY.starTints.length)]
      const op = (0.35 + rand() * 0.55).toFixed(2)
      const twinkle = r > 0.9 && rand() < 0.4
      stars.push(
        `<circle class="star${twinkle ? ' tw' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${tint}" opacity="${op}"` +
          (twinkle ? ` style="animation-duration:${(4 + rand() * 6).toFixed(1)}s;animation-delay:-${(rand() * 8).toFixed(1)}s"` : '') +
          `/>`,
      )
    }
  }
  // Along the band: sample, keep in proportion to how deep in the band.
  place(1400, () => {
    const x = 1000 + rand() * 920
    const y = rand() * H
    return rand() < bandWeight(x, y) ** 0.7 ? [x, y] : null
  })
  // Elsewhere: sparse, sparser in the middle column.
  place(260, () => {
    const x = rand() * W
    const y = rand() * H
    if (x > 560 && x < 1300 && rand() < 0.75) return null
    return [x, y]
  })

  const style =
    `.base{fill:${SKY.dark.base}}` +
    `.nebula{animation:breathe 40s ease-in-out infinite alternate}` +
    `.tw{animation:twinkle 6s ease-in-out infinite alternate}` +
    `@keyframes breathe{from{opacity:.88}to{opacity:1}}` +
    `@keyframes twinkle{from{opacity:.2}to{opacity:1}}` +
    `@media (prefers-color-scheme:light){.base{fill:${SKY.light.base}}.nebula{opacity:.55;animation:none}.star{display:none}}` +
    `@media (prefers-reduced-motion:reduce){.nebula,.tw{animation:none}}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs>${defs}</defs>` +
    `<rect class="base" fill="${SKY.dark.base}" width="${W}" height="${H}"/>` +
    nebula +
    stars.join('') +
    `</svg>`
  )
}
