/**
 * The slim bar: a thin rounded track, filled in one or more colored parts,
 * with an optional upright marker (an even pace, say). Desktop and mobile get
 * it as an SVG; the terminal, which draws no SVG, gets the same idea in
 * box-drawing characters: `━━━━┃━━━━━`.
 *
 * Shared by usage-bar and cache-control; keep the two copies the same.
 */
import type { EngineInterface, RenderInput } from 'claude-code'

export type Tone = 'success' | 'warning' | 'error' | 'cool' | 'muted'

/** Raw colors for the SVG, which can't read theme keys. They read on dark and light. */
const SVG_TONE: Record<Tone, string> = {
  success: '#4fb88a',
  warning: '#e0a84e',
  error: '#e66a75',
  cool: '#8f86e8',
  muted: '#8a8597',
}

/** Theme keys for the terminal and for text. */
export const THEME_TONE: Record<Tone, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  cool: 'suggestion',
  muted: 'inactive',
}

/** A soft wash behind a chip's text, by tone. */
const CHIP_BG: Record<Tone, string> = {
  success: 'rgba(79,184,138,0.16)',
  warning: 'rgba(224,168,78,0.18)',
  error: 'rgba(230,106,117,0.18)',
  cool: 'rgba(143,134,232,0.18)',
  muted: 'rgba(138,133,151,0.18)',
}

/**
 * One filled part: its share of the track, a tone, and, to go past the five
 * tones, a raw `hex` for the SVG and a theme key `theme` for the terminal.
 */
export type Part = { share: number; tone: Tone; hex?: string; theme?: string }

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/** The bar as SVG markup, `width` × `height` CSS pixels. */
export function slimSvg(parts: Part[], marker: number | null, width: number, height = 12): string {
  const track = 6
  const y = (height - track) / 2
  const r = track / 2
  let x = 0
  const fills: string[] = []
  for (const p of parts) {
    const w = clamp(p.share) * width
    if (w <= 0) continue
    fills.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.min(w, width - x).toFixed(1)}" height="${track}" fill="${p.hex ?? SVG_TONE[p.tone]}"/>`)
    x += w
  }
  const mark =
    marker === null
      ? ''
      : `<rect class="mark" x="${(clamp(marker) * (width - 2)).toFixed(1)}" y="0" width="2" height="${height}" rx="1"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.track{fill:rgba(255,255,255,.13)}.mark{fill:rgba(255,255,255,.8)}` +
    `@media (prefers-color-scheme:light){.track{fill:rgba(0,0,0,.1)}.mark{fill:rgba(0,0,0,.6)}}</style>` +
    `<clipPath id="c"><rect x="0" y="${y}" width="${width}" height="${track}" rx="${r}"/></clipPath>` +
    `<rect class="track" x="0" y="${y}" width="${width}" height="${track}" rx="${r}"/>` +
    `<g clip-path="url(#c)">${fills.join('')}</g>` +
    mark +
    `</svg>`
  )
}

/** The bar in characters for the terminal: runs of `━` per color, `┃` at the marker. */
export function slimRuns(parts: Part[], marker: number | null, cells: number): { text: string; color: string }[] {
  const colors: string[] = []
  for (const p of parts) {
    const n = Math.round(clamp(p.share) * cells)
    for (let i = 0; i < n && colors.length < cells; i++) colors.push(p.theme ?? THEME_TONE[p.tone])
  }
  while (colors.length < cells) colors.push('empty')
  const at = marker === null ? -1 : Math.min(cells - 1, Math.round(clamp(marker) * (cells - 1)))
  const runs: { text: string; color: string }[] = []
  colors.forEach((c, i) => {
    const color = i === at ? 'mark' : c
    const ch = i === at ? '┃' : '━'
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += ch
    else runs.push({ text: ch, color })
  })
  return runs
}

/**
 * The bar as an element: an Svg where the surface draws one, else text runs.
 * `width` is CSS pixels for the SVG; `cells` the terminal's length.
 */
export function slimBar(
  $: EngineInterface,
  e: RenderInput,
  parts: Part[],
  marker: number | null,
  opts: { width: number; cells: number; key: string },
) {
  const table = $.ui.resolve(e)
  if ('Svg' in table && (e.surface === 'desktop' || e.surface === 'mobile')) {
    const { Svg } = table
    return <Svg key={opts.key} source={slimSvg(parts, marker, opts.width)} alt={parts.map(p => `${Math.round(p.share * 100)}%`).join(', ')} width={opts.width} height={12} />
  }
  const { Text } = table
  return (
    <Text key={opts.key}>
      {slimRuns(parts, marker, opts.cells).map((run, i) =>
        run.color === 'empty' ? (
          <Text key={`r${i}`} color="subtle">
            {run.text}
          </Text>
        ) : run.color === 'mark' ? (
          <Text key={`r${i}`} weight="bold">
            {run.text}
          </Text>
        ) : (
          <Text key={`r${i}`} color={run.color}>
            {run.text}
          </Text>
        ),
      )}
    </Text>
  )
}

/** Chip text colors: lighter on dark, deeper on light. */
const CHIP_TEXT: Record<Tone, { dark: string; light: string }> = {
  success: { dark: '#7cd4a8', light: '#2f8a62' },
  warning: { dark: '#f0c070', light: '#9a6614' },
  error: { dark: '#f28b94', light: '#c2414e' },
  cool: { dark: '#b1a9f2', light: '#5d52c9' },
  muted: { dark: '#a6a1b3', light: '#6e6979' },
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A rounded pill as SVG markup, sized to its label. */
export function chipSvg(label: string, tone: Tone): { source: string; width: number; height: number } {
  const height = 18
  const width = Math.round(label.length * 6.3 + 16)
  const c = CHIP_TEXT[tone]
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.t{fill:${c.dark};font:500 11px -apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif}` +
    `@media (prefers-color-scheme:light){.t{fill:${c.light}}}</style>` +
    `<rect width="${width}" height="${height}" rx="${height / 2}" fill="${CHIP_BG[tone]}"/>` +
    `<text class="t" x="${width / 2}" y="12.5" text-anchor="middle">${escapeXml(label)}</text>` +
    `</svg>`
  return { source, width, height }
}

/**
 * A small state chip: a rounded pill where the surface draws SVG, else the
 * label on a soft wash of its tone (the terminal, square by nature).
 */
export function chip($: EngineInterface, e: RenderInput, label: string, tone: Tone) {
  const table = $.ui.resolve(e)
  if ('Svg' in table && (e.surface === 'desktop' || e.surface === 'mobile')) {
    const { Svg } = table
    const pill = chipSvg(label, tone)
    return <Svg key={`chip:${label}`} source={pill.source} alt={label} width={pill.width} height={pill.height} />
  }
  const { Text } = table
  return (
    <Text color={THEME_TONE[tone]} backgroundColor={CHIP_BG[tone]} size="caption">
      {` ${label} `}
    </Text>
  )
}
