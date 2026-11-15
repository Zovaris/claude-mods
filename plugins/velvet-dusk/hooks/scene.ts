/**
 * The Velvet Dusk scene: large soft glows that drift slowly at the edges, and a
 * few faint stars that only come out in dark mode. Seeded, so it always draws
 * the same sky. Kept away from the middle, where the words sit.
 */

const W = 1920
const H = 1080

export const SKY = {
  dark: { base: '#18151e', rose: '#c96f8c', lilac: '#7d6cc4', teal: '#3f8f8a', star: '#efe4f2' },
  light: { base: '#f3eef0', rose: '#f0b7c6', lilac: '#c9bff0', teal: '#b5ddd6' },
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

// Each glow: where it sits, how big, which color, how it drifts.
const GLOWS = [
  { id: 'rose', cx: 1640, cy: 980, r: 620, dx: -60, dy: -30, s: 52 },
  { id: 'lilac', cx: 180, cy: 120, r: 560, dx: 50, dy: 40, s: 64 },
  { id: 'teal', cx: 120, cy: 1060, r: 460, dx: 40, dy: -40, s: 58 },
  { id: 'rose2', cx: 1860, cy: 60, r: 340, dx: -30, dy: 30, s: 70 },
] as const

const colorOf = (id: string) => (id.startsWith('rose') ? 'rose' : id)

export function sceneSvg(seed = 11): string {
  const rand = rng(seed)
  const grads = GLOWS.map(g => {
    const c = colorOf(g.id) as 'rose' | 'lilac' | 'teal'
    const hex = SKY.dark[c]
    return (
      `<radialGradient id="g-${g.id}">` +
      `<stop offset="0" class="c-${c}" stop-color="${hex}" stop-opacity=".55"/>` +
      `<stop offset=".55" class="c-${c}" stop-color="${hex}" stop-opacity=".16"/>` +
      `<stop offset="1" class="c-${c}" stop-color="${hex}" stop-opacity="0"/>` +
      `</radialGradient>`
    )
  }).join('')

  const glows = GLOWS.map(
    (g, i) =>
      `<circle class="glow" style="--dx:${g.dx}px;--dy:${g.dy}px;animation-duration:${g.s}s;animation-delay:-${i * 11}s" ` +
      `cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="url(#g-${g.id})"/>`,
  ).join('')

  // Stars in the upper band only, clear of the centre column.
  const stars: string[] = []
  for (let i = 0; i < 46; i++) {
    let x = rand() * W
    if (x > 560 && x < 1360) x = x < 960 ? x - 420 : x + 420
    const y = rand() * H * 0.55
    const r = 0.6 + rand() * 1.3
    const d = (3 + rand() * 6).toFixed(1)
    const delay = (rand() * 6).toFixed(1)
    stars.push(
      `<circle class="star" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" style="animation-duration:${d}s;animation-delay:-${delay}s"/>`,
    )
  }

  const d = SKY.dark
  const l = SKY.light
  const style =
    `.base{fill:${d.base}}.c-rose{stop-color:${d.rose}}.c-lilac{stop-color:${d.lilac}}.c-teal{stop-color:${d.teal}}` +
    `.star{fill:${d.star};opacity:.5;animation:twinkle 5s ease-in-out infinite alternate}` +
    `.glow{transform-box:fill-box;transform-origin:center;animation:drift 60s ease-in-out infinite alternate}` +
    `@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(var(--dx),var(--dy)) scale(1.08)}}` +
    `@keyframes twinkle{from{opacity:.15}to{opacity:.75}}` +
    `@media (prefers-color-scheme:light){.base{fill:${l.base}}.c-rose{stop-color:${l.rose}}.c-lilac{stop-color:${l.lilac}}.c-teal{stop-color:${l.teal}}.star{display:none}}` +
    `@media (prefers-reduced-motion:reduce){.glow,.star{animation:none}}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs>${grads}</defs>` +
    `<rect class="base" fill="${d.base}" width="${W}" height="${H}"/>` +
    glows +
    stars.join('') +
    `</svg>`
  )
}
