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

export type Part = { share: number; tone: Tone }

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
    fills.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.min(w, width - x).toFixed(1)}" height="${track}" fill="${SVG_TONE[p.tone]}"/>`)
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

/** The bar in characters for the terminal: runs of `━` per tone, `┃` at the marker. */
export function slimRuns(parts: Part[], marker: number | null, cells: number): { text: string; tone: Tone | 'empty' | 'mark' }[] {
  const tones: (Tone | 'empty')[] = []
  for (const p of parts) {
    const n = Math.round(clamp(p.share) * cells)
    for (let i = 0; i < n && tones.length < cells; i++) tones.push(p.tone)
  }
  while (tones.length < cells) tones.push('empty')
  const at = marker === null ? -1 : Math.min(cells - 1, Math.round(clamp(marker) * (cells - 1)))
  const runs: { text: string; tone: Tone | 'empty' | 'mark' }[] = []
  tones.forEach((t, i) => {
    const tone = i === at ? 'mark' : t
    const ch = i === at ? '┃' : '━'
    const last = runs[runs.length - 1]
    if (last && last.tone === tone) last.text += ch
    else runs.push({ text: ch, tone })
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
        run.tone === 'empty' ? (
          <Text key={`r${i}`} color="subtle">
            {run.text}
          </Text>
        ) : run.tone === 'mark' ? (
          <Text key={`r${i}`} weight="bold">
            {run.text}
          </Text>
        ) : (
          <Text key={`r${i}`} color={THEME_TONE[run.tone]}>
            {run.text}
          </Text>
        ),
      )}
    </Text>
  )
}

/** A small state chip: the label on a soft wash of its tone. */
export function chip($: EngineInterface, e: RenderInput, label: string, tone: Tone) {
  const { Text } = $.ui.resolve(e)
  return (
    <Text color={THEME_TONE[tone]} backgroundColor={CHIP_BG[tone]} size="caption">
      {` ${label} `}
    </Text>
  )
}
