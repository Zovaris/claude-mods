import { makeColors } from './make-colors.js'

// Deep-space grays with a violet accent; cyan, mint, amber and coral keep their meaning.
export const { theme, problems } = makeColors({
  label: 'Nebula',
  roles: { accent: '#8b7cf6', danger: '#ef6f7a', success: '#5fc59a', warning: '#e7b85c', pro: '#5cc8e8' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#eef0f7',
        'surface-1': '#f4f5fa',
        'surface-2': '#fafbfd',
        'text-primary': '#1d2133',
        'text-secondary': '#444a63',
        'text-muted': '#5d6480',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b0e1a',
        'surface-1': '#0f1322',
        'surface-2': '#131829',
        'surface-3': '#171d30',
        'text-primary': '#e6e9f5',
        'text-secondary': '#b8bfd6',
        'text-muted': '#8b93ad',
      },
    },
  },
})
