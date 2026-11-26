import { expect, mock, test } from 'claude-code/testing'

import { PALETTES } from '../hooks/palettes'
import { SCENES } from '../hooks/register'
import { beamField, emberField, TINTS } from '../hooks/scenes'

test('every scene in every tint is seeded, well-formed and under the size limit', () => {
  for (const [name, scene] of Object.entries(SCENES)) {
    for (const tint of Object.keys(TINTS)) {
      const svg = scene.svg(tint)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(svg).toBe(scene.svg(tint))
      if (svg.length >= 131_072) throw new Error(`${name} in ${tint} is ${svg.length} bytes`)
    }
  }
})

test('every tint makes a palette Desktop paints', () => {
  for (const p of Object.values(PALETTES)) expect(p.problems.some(l => l.startsWith("Desktop won't paint"))).toBe(false)
})

test('the scenes keep most of the frame empty', () => {
  for (const field of [emberField(), beamField()]) {
    let lit = 0
    let all = 0
    for (let y = 0; y < 1080; y += 24) for (let x = 0; x < 1920; x += 24, all++) if (field(x, y) > 0.25) lit++
    expect(lit / all < 0.35).toBe(true)
  }
})

test('Ember in Clay is set at start, drawn on desktop, and /atelier switches and turns off', async ($, on) => {
  mock.store(on)
  const scenes: string[] = []
  on('command.register', () => ({ value: { command: 'atelier' } }))
  on('theme.set', (_, e) => {
    scenes.push((e as { backdrop: { scene: string } }).backdrop.scene)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('theme.clear', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(scenes).toEqual(['ember-clay'])

  const ui = await $.ui.mount({
    plugin: 'atelier',
    component: 'Backdrop',
    requestId: 'backdrop',
    surface: 'desktop',
    props: { scene: 'ember-clay', plugin: 'atelier', glass: { blur: 14, opacity: 0.66 } },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()

  expect((await $.command.run({ command: 'atelier', args: 'beam' })).text).toBe('Beam in Clay is on.')
  expect((await $.command.run({ command: 'atelier', args: 'sage' })).text).toBe('Beam in Sage is on.')
  expect((await $.command.run({ command: 'atelier', args: 'ember cobalt' })).text).toBe('Ember in Cobalt is on.')
  expect(scenes.at(-1)).toBe('ember-cobalt')
  expect((await $.command.run({ command: 'atelier', args: 'nope' })).text.startsWith('No scene or tint')).toBe(true)
  expect((await $.command.run({ command: 'atelier', args: 'off' })).text).toBe('Atelier is off.')
  expect((await $.command.run({ command: 'atelier', args: '' })).text.startsWith('Atelier is off.')).toBe(true)
})
