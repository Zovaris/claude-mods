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

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      snapshot: Shaped<Snapshot | null>
      focus: Shaped<string>
      open: Shaped<string[]>
      busy: Shaped<boolean>
    }
  }
}
