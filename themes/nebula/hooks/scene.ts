/**
 * The Nebula scene, drawn as a real nebula is lit: soft colored blobs (violet,
 * magenta, rose and a warm core) blurred together, then torn into wisps by a
 * displacement of fractal noise and grained by a second, finer noise; dark
 * dust lanes cut across the bright part. It sweeps in from the top-right
 * corner and fades before the middle, where the conversation sits.
 *
 * Stars follow a power law, as in a real sky: a fine dust of faint points,
 * fewer mid ones, and a dozen bright ones, warm whites and pale tints, thicker
 * along the cloud. No halos or crosses. Seeded, so the sky is always the same.
 */

const W = 1920
const H = 1080

export const SKY = {
  dark: { top: '#171127', mid: '#0e0b16', edge: '#08070c' },
  light: { top: '#f7f2fb', mid: '#f2edf6', edge: '#ece6f1' },
  starTints: ['#ffffff', '#fff4ea', '#ffe6cf', '#ffdbe7', '#ece4ff'],
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

/** The cloud's spine: from the top-right corner down and left, toward the middle. */
const SPINE = { x0: 1940, y0: -80, x1: 1060, y1: 780 }

/** 1 on the spine near the corner, falling off sideways and toward the far end. */
function cloudWeight(x: number, y: number): number {
  const dx = SPINE.x1 - SPINE.x0
  const dy = SPINE.y1 - SPINE.y0
  const len2 = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((x - SPINE.x0) * dx + (y - SPINE.y0) * dy) / len2))
  const px = SPINE.x0 + t * dx
  const py = SPINE.y0 + t * dy
  const side = Math.hypot(x - px, y - py)
  const width = 330 - t * 170
  return Math.max(0, 1 - side / width) * (1 - t * 0.75)
}

const f = (n: number) => n.toFixed(1)

/** One soft blob along the spine, at `t`, pushed `off` to one side. */
function blob(t: number, off: number, rx: number, ry: number, color: string, opacity: number): string {
  const x = SPINE.x0 + t * (SPINE.x1 - SPINE.x0) + off * 0.68
  const y = SPINE.y0 + t * (SPINE.y1 - SPINE.y0) + off * 0.73
  const angle = (Math.atan2(SPINE.y1 - SPINE.y0, SPINE.x1 - SPINE.x0) * 180) / Math.PI
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}" transform="rotate(${f(angle)} ${f(x)} ${f(y)})"/>`
}

export function sceneSvg(seed = 11): string {
  const rand = rng(seed)

  const defs =
    `<radialGradient id="sky" gradientUnits="userSpaceOnUse" cx="1720" cy="160" r="1900">` +
    `<stop offset="0" class="s0"/><stop offset=".45" class="s1"/><stop offset="1" class="s2"/></radialGradient>` +
    // Blobs → blur → torn by large noise → grained by fine noise.
    `<filter id="cloud" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="55" result="soft"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.0032" numOctaves="4" seed="5" result="warp"/>` +
    `<feDisplacementMap in="soft" in2="warp" scale="300" xChannelSelector="R" yChannelSelector="G" result="torn"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="5" seed="17" result="grain"/>` +
    `<feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -0.75" result="grainA"/>` +
    `<feComposite in="torn" in2="grainA" operator="arithmetic" k1="1.25" k2="0.3" k3="0" k4="0"/>` +
    `</filter>` +
    // A wide, faint glow under the cloud, so it seems to light the sky around it.
    `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="140"/></filter>` +
    // Dust lanes: dark noise kept only where it is dense.
    `<filter id="dust" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="40" result="soft"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="4" seed="29" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 3.4 0 0 -1.55" result="lanes"/>` +
    `<feComposite in="soft" in2="lanes" operator="in"/>` +
    `</filter>`

  const blobs =
    blob(0.08, -40, 420, 230, '#6e3a9c', 0.9) +
    blob(0.32, 60, 380, 170, '#7d40a6', 0.8) +
    blob(0.6, -30, 300, 120, '#5e3488', 0.6) +
    blob(0.86, 10, 200, 80, '#4a2a6c', 0.45) +
    blob(0.12, 50, 300, 150, '#b2468f', 0.85) +
    blob(0.38, -60, 260, 110, '#c04f8e', 0.7) +
    blob(0.62, 40, 180, 70, '#9a3f86', 0.5) +
    blob(0.22, -10, 200, 110, "#ff7d9c", 0.8) +
    blob(0.34, 30, 140, 60, "#ff96a8", 0.6) +
    blob(0.22, 0, 120, 75, "#ffc790", 0.85) +
    blob(0.24, 15, 60, 40, "#fff0d8", 0.75) +
    // A small, faint cloud low on the left, so the corner isn't empty.
    `<ellipse cx="140" cy="1010" rx="420" ry="170" fill="#6e3a9c" opacity=".45" transform="rotate(-14 140 1010)"/>` +
    `<ellipse cx="80" cy="1040" rx="240" ry="90" fill="#b2468f" opacity=".35" transform="rotate(-14 80 1040)"/>`

  const lanes = blob(0.22, 10, 360, 70, '#07060b', 1) + blob(0.45, -40, 260, 45, '#07060b', 1)

  const nebula =
    `<g class="nebula">` +
    `<g class="halo" filter="url(#glow)" opacity=".5">${blobs}</g>` +
    `<g filter="url(#cloud)">${blobs}</g>` +
    `<g class="lanes" filter="url(#dust)" opacity=".85">${lanes}</g>` +
    `</g>`

  // Stars: sizes on a power law, more of them in the cloud, few in the middle column.
  const stars: string[] = []
  const twinkles: string[] = []
  const star = (x: number, y: number, r: number, op: number, canTwinkle: boolean) => {
    const tint = SKY.starTints[Math.floor(rand() * SKY.starTints.length)]
    const tw = canTwinkle && rand() < 0.3
    const el =
      `<circle cx="${f(x)}" cy="${f(y)}" r="${r.toFixed(2)}" fill="${tint}" opacity="${op.toFixed(2)}"` +
      (tw ? ` class="tw" style="animation-duration:${(5 + rand() * 7).toFixed(1)}s;animation-delay:-${(rand() * 9).toFixed(1)}s"` : '') +
      `/>`
    ;(tw ? twinkles : stars).push(el)
  }
  const quiet = (x: number) => x > 520 && x < 1240
  const pick = (inCloud: number): [number, number, number] => {
    for (;;) {
      const x = rand() * W
      const y = rand() * H
      const w = cloudWeight(x, y)
      if (quiet(x) && w < 0.05 && rand() < 0.8) continue
      if (rand() < 1 - inCloud + inCloud * w) return [x, y, w]
    }
  }
  // Dust: faint and fine, mostly in the cloud.
  for (let i = 0; i < 620; i++) {
    const [x, y, w] = pick(0.75)
    star(x, y, 0.35 + rand() * 0.3, 0.2 + rand() * 0.35 + w * 0.2, false)
  }
  // Mid stars.
  for (let i = 0; i < 130; i++) {
    const [x, y] = pick(0.4)
    star(x, y, 0.7 + rand() * 0.4, 0.55 + rand() * 0.35, true)
  }
  // A dozen bright ones.
  for (let i = 0; i < 12; i++) {
    const [x, y] = pick(0.3)
    star(x, y, 1.25 + rand() * 0.6, 0.85 + rand() * 0.15, true)
  }

  const style =
    `.s0{stop-color:${SKY.dark.top}}.s1{stop-color:${SKY.dark.mid}}.s2{stop-color:${SKY.dark.edge}}` +
    `.nebula{animation:breathe 45s ease-in-out infinite alternate}` +
    `.tw{animation:twinkle 8s ease-in-out infinite alternate}` +
    `@keyframes breathe{from{opacity:.86}to{opacity:1}}` +
    `@keyframes twinkle{from{opacity:.25}to{opacity:1}}` +
    // Light: the same cloud as a pale watercolor on lilac paper, no stars or dust lanes.
    `@media (prefers-color-scheme:light){` +
    `.s0{stop-color:${SKY.light.top}}.s1{stop-color:${SKY.light.mid}}.s2{stop-color:${SKY.light.edge}}` +
    `.nebula{opacity:.42;animation:none}.lanes,.stars{display:none}}` +
    `@media (prefers-reduced-motion:reduce){.nebula,.tw{animation:none}}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    `<defs>${defs}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>` +
    nebula +
    `<g class="stars">${stars.join('')}${twinkles.join('')}</g>` +
    `</svg>`
  )
}
