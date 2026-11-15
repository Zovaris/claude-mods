/**
 * Draws the Tideline backdrop: plotter-style contour "islands" on deep navy,
 * the innermost ring of each in orange with a hatched fill. Pure and seeded,
 * so the same seed always draws the same map.
 */

export const PALETTE = {
  sea: '#121926',
  line: '#8d9bb5',
  accent: '#e3875a',
  dot: '#c3cde0',
}

type Island = { cx: number; cy: number; r: number; rings: number; spread: number; accent: boolean }

const W = 1920
const H = 1080

// Mostly off-canvas, so only their edges show, like the corners of a chart.
const ISLANDS: Island[] = [
  { cx: 80, cy: 1080, r: 230, rings: 15, spread: 26, accent: true },
  { cx: 1890, cy: 1010, r: 210, rings: 14, spread: 24, accent: true },
  { cx: 1720, cy: 335, r: 26, rings: 5, spread: 22, accent: true },
  { cx: -380, cy: -140, r: 470, rings: 4, spread: 30, accent: false },
  { cx: 2290, cy: 110, r: 330, rings: 3, spread: 26, accent: false },
]

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

const f = (n: number) => n.toFixed(1)

/** A closed Catmull-Rom curve through the points, as cubic Béziers. */
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length
  const at = (i: number) => pts[((i % n) + n) % n] as [number, number]
  let d = `M${f(at(0)[0])},${f(at(0)[1])}`
  for (let i = 0; i < n; i++) {
    const [x0, y0] = at(i - 1)
    const [x1, y1] = at(i)
    const [x2, y2] = at(i + 1)
    const [x3, y3] = at(i + 2)
    d += `C${f(x1 + (x2 - x0) / 6)},${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)},${f(y2 - (y3 - y1) / 6)} ${f(x2)},${f(y2)}`
  }
  return `${d}Z`
}

function ring(island: Island, k: number, waves: number[][]): string {
  const steps = 72
  const radius = island.r + k * island.spread
  const pts: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    // Lower harmonics dominate outward, so outer rings wander more.
    let wobble = 0
    for (const [freq, amp, phase] of waves as [number, number, number][]) {
      wobble += Math.sin(freq * a + phase + k * 0.18) * amp * (1 + k * 0.05)
    }
    const r = radius * (1 + wobble)
    pts.push([island.cx + Math.cos(a) * r, island.cy + Math.sin(a) * r * 0.86])
  }
  return smoothClosed(pts)
}

export function backdropSvg(seed = 7): string {
  const rand = rng(seed)
  const parts: string[] = []
  const defs: string[] = [
    `<pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="9" stroke="${PALETTE.accent}" stroke-width="1.1" stroke-opacity="0.55"/></pattern>`,
  ]

  ISLANDS.forEach((island, idx) => {
    const waves = [
      [2, 0.05 + rand() * 0.05, rand() * 6.28],
      [3, 0.03 + rand() * 0.04, rand() * 6.28],
      [5, 0.012 + rand() * 0.02, rand() * 6.28],
      [7, 0.006 + rand() * 0.01, rand() * 6.28],
    ]
    for (let k = island.rings - 1; k >= 0; k--) {
      const d = ring(island, k, waves)
      const isCore = island.accent && k === 0
      if (isCore) {
        defs.push(`<clipPath id="core${idx}"><path d="${d}"/></clipPath>`)
        parts.push(`<rect width="${W}" height="${H}" fill="url(#hatch)" clip-path="url(#core${idx})"/>`)
        parts.push(`<path d="${d}" fill="none" stroke="${PALETTE.accent}" stroke-width="1.6" stroke-opacity="0.9"/>`)
      } else {
        // Fade the lines outward.
        const opacity = Math.max(0.18, 0.62 - k * 0.028)
        parts.push(`<path d="${d}" fill="none" stroke="${PALETTE.line}" stroke-width="1.1" stroke-opacity="${opacity.toFixed(2)}"/>`)
      }
    }
  })

  // A few survey marks.
  const dots: [number, number, string][] = [
    [422, 906, PALETTE.dot],
    [4, 972, PALETTE.accent],
    [1188, 140, PALETTE.dot],
  ]
  for (const [x, y, c] of dots) parts.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" fill-opacity="0.85"/>`)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">` +
    `<defs>${defs.join('')}</defs>` +
    `<rect width="${W}" height="${H}" fill="${PALETTE.sea}"/>` +
    parts.join('') +
    `</svg>`
  )
}
