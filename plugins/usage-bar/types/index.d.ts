export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/** The first reading of a window on a local day, to count what that day used. */
export type DayMark = { day: string; startPct: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': {
      windows: Shaped<Window[]>
      readAt: Shaped<number>
      marks: Shaped<Record<string, DayMark>>
    }
  }
}
