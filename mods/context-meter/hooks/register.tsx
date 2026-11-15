/**
 * context-meter: what fills the context window.
 *
 *   - a row above the prompt: a slim bar of the window by category, the share
 *     used, a state, and the mark where auto-compact kicks in
 *   - /context-meter (or Details) opens a pane: every category, memory files,
 *     MCP tools per server, skills and agents, and a compact button with an
 *     optional focus for the summary
 *   - the breakdown is the one /context draws, read with `summary` (estimated
 *     locally, no extra requests), after each turn and on demand
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Named, Snapshot } from '../types'
import { bufferTokens, compactAt, contextState, fmtTokens, partsOf, pct, shortPath, styleOf, usedCategories } from './context'
import { chip, slimBar } from './slim'

const PANE = 'context-meter'
const snapshot = atom({ plugin: 'context-meter', key: 'snapshot' } as const, null, { shape: 'snapshot-1' })
const focus = atom({ plugin: 'context-meter', key: 'focus' } as const, '', { shape: 'focus-1' })
const open = atom({ plugin: 'context-meter', key: 'open' } as const, ['categories'], { shape: 'open-1' })
const busy = atom({ plugin: 'context-meter', key: 'busy' } as const, false, { shape: 'busy-1' })

let home: string | undefined

async function refresh($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
  const b = usage?.context.breakdown
  if (!b) return
  const servers = new Map<string, Named>()
  for (const t of b.mcpTools) {
    const s = servers.get(t.serverName) ?? { name: t.serverName, tokens: 0, detail: '' }
    s.tokens += t.isLoaded ? t.tokens : 0
    servers.set(t.serverName, s)
  }
  const counts = new Map<string, { all: number; loaded: number }>()
  for (const t of b.mcpTools) {
    const c = counts.get(t.serverName) ?? { all: 0, loaded: 0 }
    c.all += 1
    if (t.isLoaded) c.loaded += 1
    counts.set(t.serverName, c)
  }
  for (const [name, s] of servers) {
    const c = counts.get(name)
    s.detail = c ? `${c.loaded} of ${c.all} tools loaded` : ''
  }
  const snap: Snapshot = {
    model: b.model,
    totalTokens: b.totalTokens,
    rawMaxTokens: b.rawMaxTokens,
    source: String(b.autocompactSource),
    categories: b.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: String(c.kind) })),
    memoryFiles: b.memoryFiles.map(f => ({ name: f.path, tokens: f.tokens, detail: f.type })).sort((a, z) => z.tokens - a.tokens),
    mcpServers: [...servers.values()].sort((a, z) => z.tokens - a.tokens),
    skills: { count: b.skills?.totalSkills ?? 0, tokens: b.skills?.tokens ?? 0 },
    agents: b.agents.map(a => ({ name: a.agentType, tokens: a.tokens, detail: a.source })).sort((a, z) => z.tokens - a.tokens),
    at: await $.clock.now(),
  }
  await update($, snapshot, () => snap)
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Context' })

async function compact($: EngineInterface) {
  if (await read($, busy)) return
  await update($, busy, () => true)
  try {
    const instructions = (await read($, focus)).trim()
    const r = await $.session.compact(instructions ? { instructions } : undefined)
    if ('skip' in r && r.skip) $.ui.toast(`Not compacted: ${r.skip}`)
    else $.ui.toast('Compacted.')
    await update($, focus, () => '')
  } catch (err) {
    $.ui.toast(`Couldn't compact: ${String(err)}`)
  } finally {
    await update($, busy, () => false)
    await refresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    home = await $.env.get('HOME').catch(() => undefined)
    await $.command
      .register({ name: 'context-meter', description: 'What fills the context window, and a compact button' })
      .catch(err => $.ui.log(`context-meter: command not registered: ${String(err)}`, { to: 'debug' }))
    void refresh($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void refresh($)
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    void refresh($)
    return r
  })

  on('command.run', { command: 'context-meter' }, async $ => {
    await refresh($)
    await openPane($)
    return { text: 'Context pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || !s) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const used = (s.totalTokens / Math.max(1, s.rawMaxTokens)) * 100
    const line = compactAt(s)
    const state = contextState(s)
    return (
      <Box justifyContent="space-between" alignItems="center">
        <Box gap={1} alignItems="center">
          <Text dimColor>Context</Text>
          {slimBar($, e, partsOf(s), line, { width: 96, cells: 10, key: 'bar:ctx' })}
          <Text>{pct(used)}</Text>
          {chip($, e, state.label, state.tone)}
          <Text dimColor>
            {`${fmtTokens(s.totalTokens)} of ${fmtTokens(s.rawMaxTokens)}${line !== null ? ` · compacts at ${pct(line * 100)}` : ''}`}
          </Text>
        </Box>
        <Button key="details" plain dimColor label="Details" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const opened = await read($, open)
    const isBusy = await read($, busy)
    const draft = await read($, focus)
    const cols = e.props.bodyColumns ?? 50

    if (!s) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text size="heading" weight="semibold">
            Measuring…
          </Text>
          <Box marginTop={1}>
            <Button key="refresh" variant="secondary" label="Refresh" onPress={() => void refresh($)} />
          </Box>
        </Box>
      )
    }

    const used = (s.totalTokens / Math.max(1, s.rawMaxTokens)) * 100
    const line = compactAt(s)
    const state = contextState(s)
    const free = Math.max(0, s.rawMaxTokens - bufferTokens(s) - s.totalTokens)
    const toggle = (k: string) => void update($, open, o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))

    // A section: a heading with a count and Show/Hide, then its rows.
    const section = (k: string, title: string, aside: string, rows: () => unknown) => {
      const isOpen = opened.includes(k)
      return (
        <Box key={`sec:${k}`} flexDirection="column" marginTop={2}>
          <Box justifyContent="space-between" alignItems="center">
            <Text weight="semibold">{title}</Text>
            <Box gap={2} alignItems="center">
              <Text size="caption" dimColor>
                {aside}
              </Text>
              <Button key={`toggle:${k}`} plain dimColor label={isOpen ? 'Hide' : 'Show'} onPress={() => toggle(k)} />
            </Box>
          </Box>
          {isOpen && (
            <Box flexDirection="column" marginTop={1}>
              {rows() as never}
            </Box>
          )}
        </Box>
      )
    }

    const row = (k: string, dot: string | null, name: string, value: string, detail?: string) => (
      <Box key={k} justifyContent="space-between">
        <Box>
          {dot !== null && (
            <Box width={2}>
              <Text color={dot}>●</Text>
            </Box>
          )}
          <Text>{name}</Text>
          {detail && (
            <Text size="caption" dimColor>
              {'  '}
              {detail}
            </Text>
          )}
        </Box>
        <Text dimColor tabular>
          {value}
        </Text>
      </Box>
    )

    const share = (n: number) => pct((n / Math.max(1, s.rawMaxTokens)) * 100)
    const total = (xs: Named[]) => xs.reduce((a, x) => a + x.tokens, 0)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Text size="heading" weight="semibold">
            {`${fmtTokens(s.totalTokens)} of ${fmtTokens(s.rawMaxTokens)}`}
          </Text>
          {chip($, e, state.label, state.tone)}
        </Box>
        <Text size="caption" dimColor>
          {s.model} · {pct(used)} used{line !== null ? ` · ${fmtTokens(free)} free before auto-compact` : ''}
        </Text>

        <Box marginTop={2}>
          {slimBar($, e, partsOf(s), line, { width: 360, cells: Math.max(20, Math.min(48, cols - 4)), key: 'pbar:ctx' })}
        </Box>
        {line !== null && (
          <Box marginTop={1}>
            <Text size="caption" dimColor>
              The mark is where auto-compact kicks in ({pct(line * 100)} of the window).
            </Text>
          </Box>
        )}

        {section('categories', 'What fills it', `${usedCategories(s).length} categories`, () =>
          usedCategories(s).map(c => row(`cat:${c.name}`, styleOf(c.name).theme, c.name, `${fmtTokens(c.tokens)} · ${share(c.tokens)}`)),
        )}

        {s.memoryFiles.length > 0 &&
          section('memory', 'Memory files', `${s.memoryFiles.length} · ${fmtTokens(total(s.memoryFiles))}`, () =>
            s.memoryFiles.map(f => row(`mem:${f.name}`, null, shortPath(f.name, home), fmtTokens(f.tokens), f.detail)),
          )}

        {s.mcpServers.length > 0 &&
          section('mcp', 'MCP tools', `${s.mcpServers.length} server${s.mcpServers.length === 1 ? "" : "s"} · ${fmtTokens(total(s.mcpServers))}`, () => [
            ...s.mcpServers.map(m => row(`mcp:${m.name}`, null, m.name, fmtTokens(m.tokens), m.detail)),
            <Box key="mcp:hint" marginTop={1}>
              <Text size="caption" dimColor>
                Turn servers off with /tools to free their share.
              </Text>
            </Box>,
          ])}

        {(s.skills.count > 0 || s.agents.length > 0) &&
          section('listings', 'Skills and agents', `${fmtTokens(s.skills.tokens + total(s.agents))}`, () => [
            row('skills', null, `${s.skills.count} skills listed`, fmtTokens(s.skills.tokens)),
            ...s.agents.map(a => row(`agent:${a.name}`, null, a.name, fmtTokens(a.tokens), a.detail)),
          ])}

        <Box flexDirection="column" marginTop={2}>
          <Text weight="semibold">Compact</Text>
          <Box marginTop={1}>
            <Text dimColor>Summarize the conversation so far to free the window. Add a focus to say what the summary should keep.</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Input
              key="focus"
              placeholder="Keep the open decisions and file paths"
              value={draft}
              onInput={v => void update($, focus, () => v)}
              onSubmit={() => void compact($)}
            />
          </Box>
          <Box marginTop={1} gap={1}>
            <Button key="compact" label={isBusy ? 'Compacting…' : 'Compact now'} onPress={() => void compact($)} />
            <Button key="refresh" variant="secondary" label="Refresh" onPress={() => void refresh($)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
