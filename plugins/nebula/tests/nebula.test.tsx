import { expect, mock, test } from 'claude-code/testing'

import { problems } from '../hooks/palette'
import { sceneSvg } from '../hooks/scene'

test('the scene is seeded, well-formed and under the size limit', () => {
  const svg = sceneSvg()
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.endsWith('</svg>')).toBe(true)
  expect(svg).toBe(sceneSvg())
  expect(svg.length < 131_072).toBe(true)
})

test('the palette is one Desktop paints', () => {
  expect(problems.some(p => p.startsWith("Desktop won't paint"))).toBe(false)
})

test('the look is set at start and its scene drawn on desktop', async ($, on) => {
  mock.store(on)
  const sets: unknown[] = []
  on('command.register', () => ({ value: { command: 'nebula' } }))
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets.length).toBe(1)

  const ui = await $.ui.mount({
    plugin: 'nebula',
    component: 'Backdrop',
    requestId: 'backdrop',
    surface: 'desktop',
    props: { scene: 'nebula', plugin: 'nebula', glass: { blur: 24, opacity: 0.72 } },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})
