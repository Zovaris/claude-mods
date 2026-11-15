export type ToolEntry = { name: string; server: string | null }
export type ServerEntry = {
  name: string
  id?: string
  kind: string
  status: string
  tool_count?: number
}
export type SkillEntry = { name: string; source: string; pluginName?: string }

declare module 'claude-code' {
  interface PluginState {
    'tool-toggle': {
      disabled: Shaped<string[]>
      expanded: Shaped<string[]>
      tools: Shaped<ToolEntry[]>
      servers: Shaped<ServerEntry[]>
      pending: Shaped<string[]>
      query: Shaped<string>
      skills: Shaped<SkillEntry[]>
    }
  }
}
