/**
 * tideline: the Tideline Night look.
 *
 * A dark navy palette with orange accents (generated with the design system's
 * makeColors), and a contour-line scene behind the conversation with dark
 * frosted panels. Desktop and mobile apps draw it; the terminal draws no look.
 * /tideline turns it off and on; the choice is kept across sessions.
 */
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { PALETTE, backdropSvg } from './contours'
import { makeColors } from './make-colors.js'

const SCENE = 'tideline'
const SVG = backdropSvg()

const { theme, problems } = makeColors({
  label: 'Tideline Night',
  only: 'dark',
  roles: { accent: '#e3875a', danger: '#e0605a', success: '#78c896', warning: '#e3b55a', pro: '#9d8ce0' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#121926',
        'surface-1': '#161e2c',
        'surface-2': '#1a2332',
        'surface-3': '#1e283a',
        'text-primary': '#e8edf5',
        'text-secondary': '#bcc6d6',
        'text-muted': '#93a0b6',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE, glass: { blur: 18, tint: PALETTE.sea, opacity: 0.7 } },
}

const apply = async ($: EngineInterface) => {
  const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) $.ui.toast(`tideline: ${unpainted}`)
  return $.theme.set(LOOK)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'tideline',
      description: 'Turn the Tideline Night look on or off',
      argumentHint: '[on|off]',
    })
    if ((await $.store.get('enabled')) !== false) {
      const res = await apply($)
      if (!res.isDrawn) $.ui.status(`tideline: ${res.reason}`)
    }
    return r
  })

  on('command.run', { command: 'tideline' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await $.store.get('enabled')) === false
    await $.store.set('enabled', isOn)
    if (!isOn) {
      await $.theme.clear()
      $.ui.status(undefined)
      return { text: 'Tideline Night is off.' }
    }
    const res = await apply($)
    return { text: res.isDrawn ? 'Tideline Night is on.' : `Tideline Night is on, but nothing draws it here: ${res.reason}` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SVG} alt="Contour lines on a dark navy sea" isInteractive />
  })
}
