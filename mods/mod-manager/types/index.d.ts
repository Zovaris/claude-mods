export type Kind = 'mod' | 'theme' | 'plugin'

export type Entry = {
  /** `<name>@<marketplace>` */
  id: string
  name: string
  marketplace: string
  kind: Kind
  description: string
  installed: boolean
  enabled: boolean
  version: string | null
  /** The version the marketplace offers, when it reads one. */
  latest: string | null
  scope: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': {
      entries: Shaped<Entry[]>
      busy: Shaped<string | null>
      open: Shaped<string[]>
      note: Shaped<string>
      dirty: Shaped<boolean>
    }
  }
}
