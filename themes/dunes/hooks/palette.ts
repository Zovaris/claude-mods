import { makeColors } from './make-colors.js'

// Rust-black grays with a vermilion accent, from the scene's sun and lit
// sand. Danger leans crimson so it stays apart from the accent; sage, amber
// and rose keep their meaning.
export const { theme, problems } = makeColors({
  label: 'Dunes',
  roles: { accent: '#e5533a', danger: '#e8455f', success: '#93b87a', warning: '#e7a948', pro: '#e88a9c' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f5ece5',
        'surface-1': '#f9f2ec',
        'surface-2': '#fcf8f4',
        'text-primary': '#2b1914',
        'text-secondary': '#563a32',
        'text-muted': '#6d5148',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#120807',
        'surface-1': '#180d0b',
        'surface-2': '#1e120f',
        'surface-3': '#241613',
        'text-primary': '#f3e6e0',
        'text-secondary': '#cdb8b0',
        'text-muted': '#a68e86',
      },
    },
  },
})
