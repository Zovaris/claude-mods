import { makeColors } from './make-colors.js'

// Violet-black grays with an orchid accent, from the scene's lilac, rose and
// peach; mint, amber and coral keep their meaning.
export const { theme, problems } = makeColors({
  label: 'Nebula',
  roles: { accent: '#a98be8', danger: '#ee7f8a', success: '#7cc9a0', warning: '#e9bd78', pro: '#f2a3c4' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f3f1f7',
        'surface-1': '#f7f5fa',
        'surface-2': '#fbfafd',
        'text-primary': '#221f2e',
        'text-secondary': '#4a4558',
        'text-muted': '#625c72',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0d0c13',
        'surface-1': '#121119',
        'surface-2': '#17161f',
        'surface-3': '#1c1a25',
        'text-primary': '#ebe8f2',
        'text-secondary': '#c0bccb',
        'text-muted': '#96919f',
      },
    },
  },
})
