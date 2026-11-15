/**
 * dunes: the Dunes look, for light and dark.
 *
 * Rust-black grays with a vermilion accent; sage, amber, crimson and rose for
 * meaning (generated with the design system's makeColors), and a scene of
 * a red desert drawn in ASCII, dusk in dark mode and noon in light. Desktop and mobile apps draw it; the
 * terminal draws no look. /dunes turns it off and on, kept across sessions.
 */
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { problems, theme } from './palette'
import { sceneSvg } from './scene'

const SCENE = 'dunes'
const SVG = sceneSvg()


// No tint: the glass follows each mode's own panel color.
const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: SCENE, glass: { blur: 16, opacity: 0.62 } } }

const apply = async ($: EngineInterface) => {
  const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`dunes: ${unpainted}`)
  return $.theme.set(LOOK)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'dunes',
      description: 'Turn the Dunes look on or off',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('enabled')) !== false) {
      const res = await apply($)
      if (!res.isDrawn) $.ui.log(`dunes: not drawn: ${res.reason}`, { to: 'debug' })
    }
    return r
  })

  on('command.run', { command: 'dunes' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await $.store.get('enabled')) === false
    await $.store.set('enabled', isOn)
    if (!isOn) {
      await $.theme.clear()
      return { text: 'Dunes is off.' }
    }
    const res = await apply($)
    return { text: res.isDrawn ? 'Dunes is on.' : `Dunes is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SVG} alt="Red sand dunes drawn in ASCII under a low sun" isInteractive />
  })
}
