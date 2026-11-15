/**
 * velvet-dusk: the Velvet Dusk look, for light and dark.
 *
 * Plum-tinted grays with a dusty-rose accent, sage, honey and lavender for
 * meaning (generated with the design system's makeColors), and a scene of
 * slow dusk glows at the screen's edges. Desktop and mobile apps draw it; the
 * terminal draws no look. /velvet-dusk turns it off and on, kept across sessions.
 */
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { problems, theme } from './palette'
import { sceneSvg } from './scene'

const SCENE = 'velvet-dusk'
const SVG = sceneSvg()


// No tint: the glass follows each mode's own panel color.
const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: SCENE, glass: { blur: 24, opacity: 0.72 } } }

const apply = async ($: EngineInterface) => {
  const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`velvet-dusk: ${unpainted}`)
  return $.theme.set(LOOK)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'velvet-dusk',
      description: 'Turn the Velvet Dusk look on or off',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('enabled')) !== false) {
      const res = await apply($)
      if (!res.isDrawn) $.ui.log(`velvet-dusk: not drawn: ${res.reason}`, { to: 'debug' })
    }
    return r
  })

  on('command.run', { command: 'velvet-dusk' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await $.store.get('enabled')) === false
    await $.store.set('enabled', isOn)
    if (!isOn) {
      await $.theme.clear()
      return { text: 'Velvet Dusk is off.' }
    }
    const res = await apply($)
    return { text: res.isDrawn ? 'Velvet Dusk is on.' : `Velvet Dusk is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SVG} alt="Soft dusk glows at the edges of a plum sky" isInteractive />
  })
}
