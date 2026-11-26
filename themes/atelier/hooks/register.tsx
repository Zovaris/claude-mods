/**
 * atelier: quiet dot-dither looks on Claude's warm grays, for light and dark.
 *
 * Several scenes (Ember is the default) in one of ten tints (Clay is the
 * default); the tint is also the app's accent.
 * Desktop and mobile apps draw it; the terminal draws no look. `/atelier`
 * takes a scene, a tint, both, or `off`, and the choice is kept across
 * sessions.
 */
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { PALETTES } from './palettes'
import { auroraSvg, beamSvg, dunesSvg, emberSvg, nebulaSvg, orbitSvg, tideSvg, TINTS } from './scenes'

export const SCENES: Record<string, { label: string; blurb: string; alt: string; svg: (tint: string) => string }> = {
  ember: {
    label: 'Ember',
    blurb: 'a low sun dithered out of the corner',
    alt: 'A low sun in dots rising from the bottom-right corner',
    svg: emberSvg,
  },
  beam: {
    label: 'Beam',
    blurb: 'one dithered streak of light ending in a spark',
    alt: 'A streak of dots crossing from the left and ending in a spark',
    svg: beamSvg,
  },
  dunes: {
    label: 'Dunes',
    blurb: 'three ridges of sand under a low sun',
    alt: 'Three ridges of sand in dots under a low sun',
    svg: dunesSvg,
  },
  nebula: {
    label: 'Nebula',
    blurb: 'a torn band of gas with sparse stars',
    alt: 'A band of gas in dots sweeping across the sky, with stars',
    svg: nebulaSvg,
  },
  tide: {
    label: 'Tide',
    blurb: 'thin swells rolling across the bottom',
    alt: 'Thin lines of dots rolling like swells across the bottom',
    svg: tideSvg,
  },
  orbit: {
    label: 'Orbit',
    blurb: 'a small ringed planet high on the left',
    alt: 'A small planet in dots with thin tilted rings',
    svg: orbitSvg,
  },
  aurora: {
    label: 'Aurora',
    blurb: 'soft curtains of light hanging from the top',
    alt: 'Curtains of dotted light swaying down from the top',
    svg: auroraSvg,
  },
}

export const DEFAULT = { scene: 'ember', tint: 'clay' }
const GLASS = { blur: 14, opacity: 0.66 }

type Choice = { scene: string; tint: string; isOn: boolean }

const drawn = new Map<string, string>()
const svgOf = (scene: string, tint: string) => {
  const key = `${scene}-${tint}`
  let s = drawn.get(key)
  if (s === undefined) drawn.set(key, (s = SCENES[scene]!.svg(tint)))
  return s
}

const chosen = async ($: EngineInterface): Promise<Choice> => {
  const [scene, tint, on] = await Promise.all(['scene', 'tint', 'on'].map(k => $.store.get(k)))
  return {
    scene: typeof scene === 'string' && scene in SCENES ? scene : DEFAULT.scene,
    tint: typeof tint === 'string' && tint in TINTS ? tint : DEFAULT.tint,
    isOn: on !== false,
  }
}

const apply = async ($: EngineInterface, c: Choice) => {
  const palette = PALETTES[c.tint]!
  const unpainted = palette.problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`atelier: ${unpainted}`)
  const args: ThemeSetArgs = { colors: palette.theme, backdrop: { scene: `${c.scene}-${c.tint}`, glass: GLASS } }
  return $.theme.set(args)
}

const name = (c: Choice) => `${SCENES[c.scene]!.label} in ${TINTS[c.tint]!.label}`

const menu = (c: Choice) =>
  [
    `Atelier is ${c.isOn ? `on: ${name(c)}` : 'off'}.`,
    '',
    'Scenes:',
    ...Object.entries(SCENES).map(([k, s]) => `${k === c.scene ? '●' : '○'} ${k}: ${s.blurb}`),
    '',
    'Tints:',
    ...Object.entries(TINTS).map(([k, t]) => `${k === c.tint ? '●' : '○'} ${k}: ${t.accent}`),
    '',
    '/atelier beam, /atelier sage, /atelier ember cobalt, /atelier off.',
  ].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'atelier',
      description: 'Pick a look: a scene, a tint, or off (no argument lists them)',
      argumentHint: '[scene] [tint] | off',
    })
    const c = await chosen($)
    if (c.isOn) {
      const res = await apply($, c)
      if (!res.isDrawn) $.ui.log(`atelier: not drawn: ${res.reason}`, { to: 'debug' })
    }
    return r
  })

  on('command.run', { command: 'atelier' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const c = await chosen($)
    if (words.length === 0) return { text: menu(c) }
    if (words.length === 1 && words[0] === 'off') {
      await $.store.set('on', false)
      await $.theme.clear()
      return { text: 'Atelier is off.' }
    }
    for (const w of words) {
      if (w === 'on') continue
      else if (w in SCENES) c.scene = w
      else if (w in TINTS) c.tint = w
      else return { text: `No scene or tint called "${w}". Scenes: ${Object.keys(SCENES).join(', ')}. Tints: ${Object.keys(TINTS).join(', ')}.` }
    }
    c.isOn = true
    await Promise.all([$.store.set('scene', c.scene), $.store.set('tint', c.tint), $.store.set('on', true)])
    const res = await apply($, c)
    return { text: res.isDrawn ? `${name(c)} is on.` : `${name(c)} is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const [scene, tint] = typeof e.props.scene === 'string' ? e.props.scene.split('-') : []
    if (e.props.plugin !== $.plugin.name || !scene || !tint || !(scene in SCENES) || !(tint in TINTS)) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={svgOf(scene, tint)} alt={SCENES[scene]!.alt} isInteractive />
  })
}
