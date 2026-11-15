/**
 * tideline: the Tideline Night theme.
 *
 * Sets a backdrop behind the conversation (desktop and mobile apps) with dark
 * frosted panels, and draws it as contour lines. /tideline turns it off and on;
 * the choice is kept across sessions. The terminal draws no backdrop.
 */
import type { EngineInterface, Register } from 'claude-code'

import { PALETTE, backdropSvg } from './contours.ts'

const ID = 'tideline'
const SVG = backdropSvg()

const apply = ($: EngineInterface) =>
  $.theme.set({
    backdrop: {
      id: ID,
      glass: { blur: 18, tint: PALETTE.sea, opacity: 0.74 },
      colorScheme: 'dark',
    },
  })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'tideline',
      description: 'Turn the Tideline Night theme on or off',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('enabled')) !== false) {
      const res = await apply($)
      if (!res.isDrawn) $.ui.log(`tideline: no backdrop drawn: ${res.reason}`, { to: 'debug' })
    }
    return r
  })

  on('command.run', { command: 'tideline' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await $.store.get('enabled')) === false
    await $.store.set('enabled', isOn)
    if (!isOn) {
      await $.theme.clear()
      return { text: 'Tideline Night is off.' }
    }
    const res = await apply($)
    return { text: res.isDrawn ? 'Tideline Night is on.' : `Tideline Night is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.id !== ID) return next(e)
    const table = $.ui.resolve(e)
    if (!('Svg' in table)) return next(e)
    const { Svg } = table
    return <Svg source={SVG} alt="Contour lines on a dark navy sea" />
  })
}
