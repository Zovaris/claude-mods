/**
 * The Nebula scene: a deep starfield, nebula glows at the edges, a ringed
 * planet in the lower right and, now and then, a shooting star. Seeded, so the
 * sky is always the same. The middle stays quiet for the conversation.
 */

const W = 1920
const H = 1080

export const SPACE = {
  dark: { base: '#0b0e1a', violet: '#5b3fd1', magenta: '#a3418f', cyan: '#1f86b0', star: '#eef1ff' },
  light: { base: '#eef0f7', violet: '#cbc2f7', magenta: '#efc3e2', cyan: '#bfe3f1', star: '#7c84a8' },
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

type Glow = { id: string; tone: 'violet' | 'magenta' | 'cyan'; cx: number; cy: number; rx: number; ry: number; dx: number; dy: number; s: number }

const GLOWS: Glow[] = [
  { id: 'a', tone: 'violet', cx: 160, cy: 140, rx: 640, ry: 420, dx: 40, dy: 30, s: 70 },
  { id: 'b', tone: 'magenta', cx: 420, cy: 40, rx: 360, ry: 220, dx: 30, dy: 20, s: 84 },
  { id: 'c', tone: 'cyan', cx: 60, cy: 1020, rx: 520, ry: 360, dx: 40, dy: -30, s: 76 },
  { id: 'd', tone: 'violet', cx: 1900, cy: 260, rx: 420, ry: 520, dx: -30, dy: 30, s: 90 },
  { id: 'e', tone: 'magenta', cx: 1660, cy: 1060, rx: 520, ry: 300, dx: -40, dy: -20, s: 66 },
]

export function sceneSvg(seed = 42): string {
  const rand = rng(seed)
  const d = SPACE.dark
  const l = SPACE.light

  const grads = GLOWS.map(
    g =>
      `<radialGradient id="g${g.id}">` +
      `<stop offset="0" class="t-${g.tone}" stop-color="${d[g.tone]}" stop-opacity=".5"/>` +
      `<stop offset=".5" class="t-${g.tone}" stop-color="${d[g.tone]}" stop-opacity=".14"/>` +
      `<stop offset="1" class="t-${g.tone}" stop-color="${d[g.tone]}" stop-opacity="0"/>` +
      `</radialGradient>`,
  ).join('')

  const glows = GLOWS.map(
    (g, i) =>
      `<ellipse class="glow" style="--dx:${g.dx}px;--dy:${g.dy}px;animation-duration:${g.s}s;animation-delay:-${i * 13}s" ` +
      `cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="url(#g${g.id})"/>`,
  ).join('')

  // Three layers of stars: many faint, some medium, a few bright with a glint.
  const stars: string[] = []
  for (let i = 0; i < 220; i++) {
    const x = rand() * W
    const y = rand() * H
    // Fewer and fainter stars in the middle column, where the words sit.
    const inMiddle = x > 600 && x < 1320
    if (inMiddle && rand() < 0.6) continue
    const layer = rand()
    const r = layer < 0.75 ? 0.5 + rand() * 0.6 : layer < 0.95 ? 1 + rand() * 0.6 : 1.6 + rand() * 0.8
    const base = (layer < 0.75 ? 0.25 : 0.5) + rand() * 0.3
    const twinkle = rand() < 0.35
    stars.push(
      `<circle class="star${twinkle ? ' tw' : ''}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" ` +
        `fill="${d.star}" opacity="${(inMiddle ? base * 0.6 : base).toFixed(2)}"` +
        (twinkle ? ` style="animation-duration:${(3 + rand() * 5).toFixed(1)}s;animation-delay:-${(rand() * 6).toFixed(1)}s"` : '') +
        `/>`,
    )
  }
  const glints = [
    [312, 248],
    [1702, 132],
    [1540, 702],
    [218, 772],
  ]
    .map(
      ([x, y]) =>
        `<g class="glint" fill="${d.star}"><circle cx="${x}" cy="${y}" r="2.2"/>` +
        `<rect x="${(x ?? 0) - 9}" y="${(y ?? 0) - 0.5}" width="18" height="1" opacity=".55"/>` +
        `<rect x="${(x ?? 0) - 0.5}" y="${(y ?? 0) - 9}" width="1" height="18" opacity=".55"/></g>`,
    )
    .join('')

  // A ringed planet low in the right corner: back half of the ring, planet, front half.
  const px = 1760
  const py = 930
  const pr = 120
  const planet =
    `<g class="planet" transform="rotate(-16 ${px} ${py})">` +
    `<path d="M${px - 250},${py} A250,52 0 0 1 ${px + 250},${py}" fill="none" stroke="url(#ring)" stroke-width="10" opacity=".55"/>` +
    `<circle cx="${px}" cy="${py}" r="${pr}" fill="url(#planet)"/>` +
    `<circle cx="${px}" cy="${py}" r="${pr}" fill="url(#shade)"/>` +
    `<path d="M${px - 250},${py} A250,52 0 0 0 ${px + 250},${py}" fill="none" stroke="url(#ring)" stroke-width="10" opacity=".8"/>` +
    `</g>`

  const defs =
    grads +
    `<radialGradient id="planet" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#7d6ae0"/><stop offset=".55" stop-color="#3a2f86"/><stop offset="1" stop-color="#141433"/></radialGradient>` +
    `<radialGradient id="shade" cx=".75" cy=".8" r=".8"><stop offset=".3" stop-color="#05060d" stop-opacity="0"/><stop offset="1" stop-color="#05060d" stop-opacity=".85"/></radialGradient>` +
    `<linearGradient id="ring" x1="0" x2="1"><stop offset="0" stop-color="#c8bdfc" stop-opacity="0"/><stop offset=".25" stop-color="#c8bdfc" stop-opacity=".7"/><stop offset=".75" stop-color="#9fd6ee" stop-opacity=".7"/><stop offset="1" stop-color="#9fd6ee" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></linearGradient>`

  // A shooting star crosses the upper left once every 23 s.
  const meteor = `<g class="meteor"><rect x="0" y="0" width="160" height="1.6" rx=".8" fill="url(#trail)"/></g>`

  const style =
    `.glow{transform-box:fill-box;transform-origin:center;animation:drift 70s ease-in-out infinite alternate}` +
    `.tw{animation:twinkle 5s ease-in-out infinite alternate}` +
    `.glint{animation:twinkle 7s ease-in-out infinite alternate}` +
    `.planet{animation:float 40s ease-in-out infinite alternate}` +
    `.meteor{opacity:0;animation:meteor 23s linear infinite;animation-delay:4s}` +
    `@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(var(--dx),var(--dy)) scale(1.07)}}` +
    `@keyframes twinkle{from{opacity:.2}to{opacity:.95}}` +
    `@keyframes float{from{transform:rotate(-16deg) translateY(0)}to{transform:rotate(-16deg) translateY(-8px)}}` +
    `@keyframes meteor{0%{opacity:0;transform:translate(180px,60px) rotate(18deg)}2%{opacity:1}6%{opacity:0;transform:translate(620px,200px) rotate(18deg)}100%{opacity:0;transform:translate(620px,200px) rotate(18deg)}}` +
    `@media (prefers-color-scheme:light){` +
    `.base{fill:${l.base}}.t-violet{stop-color:${l.violet}}.t-magenta{stop-color:${l.magenta}}.t-cyan{stop-color:${l.cyan}}` +
    `.star,.glint{fill:${l.star}}.meteor{display:none}}` +
    `@media (prefers-reduced-motion:reduce){.glow,.tw,.glint,.planet,.meteor{animation:none}}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs>${defs}</defs>` +
    `<rect class="base" fill="${d.base}" width="${W}" height="${H}"/>` +
    glows +
    stars.join('') +
    glints +
    meteor +
    planet +
    `</svg>`
  )
}
