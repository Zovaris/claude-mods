import { makeColors } from './make-colors.js'
import { TINTS } from './scenes'

/**
 * One palette per tint: Claude's own warm grays and ivory, with the tint as
 * the accent. Danger leans rose so it stays apart from a clay accent.
 */
export const PALETTES = Object.fromEntries(
  Object.entries(TINTS).map(([k, t]) => [
    k,
    makeColors({
      label: t.label,
      roles: { accent: t.accent, danger: '#e5657a', success: '#8fb77e', warning: '#e3a857', pro: '#c792d8' },
      light: {
        gray: {
          anchors: {
            'surface-0': '#f0eee6',
            'surface-1': '#f5f4ed',
            'surface-2': '#faf9f5',
            'text-primary': '#141413',
            'text-secondary': '#3d3d3a',
            'text-muted': '#605e58',
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': '#1a1918',
            'surface-1': '#1f1e1d',
            'surface-2': '#262624',
            'surface-3': '#30302e',
            'text-primary': '#f0eee6',
            'text-secondary': '#c2c0b6',
            'text-muted': '#9c9a92',
          },
        },
      },
    }),
  ]),
)
