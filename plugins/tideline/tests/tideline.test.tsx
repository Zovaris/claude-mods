import { expect, mock, test } from 'claude-code/testing'

import { backdropSvg } from '../hooks/contours'

test('the backdrop is a seeded, well-formed SVG', () => {
  const svg = backdropSvg()
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.endsWith('</svg>')).toBe(true)
  expect(svg).toBe(backdropSvg())
  expect(svg.length < 131_072).toBe(true)
})

test('the theme is set at start and drawn as an Svg on desktop', async ($, on) => {
  mock.store(on)
  const sets: unknown[] = []
  on('command.register', () => ({ value: { command: 'tideline' } }))
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets.length).toBe(1)

  const ui = await $.ui.mount({
    plugin: 'tideline',
    component: 'Backdrop',
    requestId: 'backdrop',
    surface: 'desktop',
    props: { scene: 'tideline', plugin: 'tideline', glass: { blur: 18, opacity: 0.7 } },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})
