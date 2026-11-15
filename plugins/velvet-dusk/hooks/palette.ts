import { makeColors } from './make-colors.js'

// Plum-tinted grays with a dusty-rose accent; sage, honey and lavender keep their meaning.
export const { theme, problems } = makeColors({
  label: 'Velvet Dusk',
  roles: { accent: '#d47f98', danger: '#d9645f', success: '#6fae8c', warning: '#d8a556', pro: '#9b8ae0' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f3eef0',
        'surface-1': '#f8f4f6',
        'surface-2': '#fcfafb',
        'text-primary': '#2b2230',
        'text-secondary': '#54485a',
        'text-muted': '#6c6072',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#18151e',
        'surface-1': '#1d1924',
        'surface-2': '#221e2a',
        'surface-3': '#272230',
        'text-primary': '#ede6ef',
        'text-secondary': '#c8bfcc',
        'text-muted': '#a197a8',
      },
    },
  },
})
