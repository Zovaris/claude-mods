export type Category = { name: string; tokens: number; kind: string }
export type Named = { name: string; tokens: number; detail?: string }

/** The context as the last breakdown measured it, kept small. */
export type Snapshot = {
  model: string
  totalTokens: number
  rawMaxTokens: number
  source: string
  categories: Category[]
  memoryFiles: Named[]
  mcpServers: Named[]
  skills: { count: number; tokens: number }
  agents: Named[]
  at: number
}

export type Style = 'default' | 'handoff' | 'code' | 'custom'

/** The mod's own auto-compact: when, how it asks, and the summary's style. */
export type AutoSettings = {
  /** Share of the window, 1 to 95, that triggers it; null for off. */
  threshold: number | null
  /** `ask` asks first; `auto` compacts at once. */
  mode: 'ask' | 'auto'
  style: Style
  custom: string
  /** Also give `/compact` and Claude Code's own auto-compact this style. */
  everywhere: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      snapshot: Shaped<Snapshot | null>
      focus: Shaped<string>
      open: Shaped<string[]>
      busy: Shaped<boolean>
      auto: Shaped<AutoSettings>
      snooze: Shaped<number>
    }
  }
}
