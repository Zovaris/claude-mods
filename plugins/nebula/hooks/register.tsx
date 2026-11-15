/**
 * nebula: the Nebula look, for light and dark.
 *
 * Violet-black grays with an orchid accent; mint, amber, coral and rose for
 * meaning (generated with the design system's makeColors), and a scene of
 * a gas nebula band and clean stars. Desktop and mobile apps draw it; the
 * terminal draws no look. /nebula turns it off and on, kept across sessions.
 */
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { problems, theme } from './palette'
import { sceneSvg } from './scene'

const SCENE = 'nebula'
const SVG = sceneSvg()


// No tint: the glass follows each mode's own panel color.
const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: SCENE, glass: { blur: 24, opacity: 0.72 } } }

const apply = async ($: EngineInterface) => {
  const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`nebula: ${unpainted}`)
  return $.theme.set(LOOK)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'nebula',
      description: 'Turn the Nebula look on or off',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('enabled')) !== false) {
      const res = await apply($)
      if (!res.isDrawn) $.ui.log(`nebula: not drawn: ${res.reason}`, { to: 'debug' })
    }
    return r
  })

  on('command.run', { command: 'nebula' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await $.store.get('enabled')) === false
    await $.store.set('enabled', isOn)
    if (!isOn) {
      await $.theme.clear()
      return { text: 'Nebula is off.' }
    }
    const res = await apply($)
    return { text: res.isDrawn ? 'Nebula is on.' : `Nebula is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SVG} alt="A band of lilac and rose nebula gas with stars" isInteractive />
  })
}
