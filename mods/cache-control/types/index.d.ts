export type Sample = {
  turnId: string
  model: string
  /** ms epoch when the request started: the cache lifetime counts from here */
  startedAt: number
  read: number
  write: number
  fresh: number
  output: number
  /** a keep-warm ping, not a turn */
  isPing?: boolean
}

export type Ping = { at: number; read: number; write: number; usd: number | null; ok: boolean; note: string }

declare module 'claude-code' {
  interface PluginState {
    'cache-control': {
      samples: Shaped<Sample[]>
      observedTtl: Shaped<'5m' | '1h' | null>
      compactedAt: Shaped<number>
      warmUntil: Shaped<number>
      lastPing: Shaped<Ping | null>
      guard: Shaped<boolean>
    }
  }
}
