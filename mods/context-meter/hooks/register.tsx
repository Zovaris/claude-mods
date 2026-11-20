/**
 * context-meter: what fills the context window.
 *
 *   - a row above the prompt: a slim bar of the window by category, the share
 *     used, a state, and the mark where auto-compact kicks in
 *   - /context-meter (or Details) opens a pane: every category, memory files,
 *     MCP tools per server, skills and agents, and a compact button with an
 *     optional focus for the summary
 *   - the breakdown is the one /context draws, read with `summary` (estimated
 *     locally, no extra requests), for the categories; the total and percent are
 *     the tokens and window of the last API response when it measured them
 *   - refreshed on session.measure (context changed), turn.step (throttled),
 *     turn.complete and on demand
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AutoSettings, Named, Snapshot, Style } from '../types'
import {
  bufferTokens,
  compactAt,
  contextState,
  DEFAULT_AUTO,
  fillOf,
  fmtTokens,
  isDue,
  joinInstructions,
  markOf,
  partsOf,
  pct,
  shortPath,
  STYLES,
  styleOf,
  usedCategories,
  usedShare,
} from './context'
import { chip, slimBar } from './slim'

const PANE = 'context-meter'
const snapshot = atom({ plugin: 'context-meter', key: 'snapshot' } as const, null, { shape: 'snapshot-2' })
const focus = atom({ plugin: 'context-meter', key: 'focus' } as const, '', { shape: 'focus-1' })
const open = atom({ plugin: 'context-meter', key: 'open' } as const, ['categories'], { shape: 'open-1' })
const busy = atom({ plugin: 'context-meter', key: 'busy' } as const, false, { shape: 'busy-1' })
const auto = atom({ plugin: 'context-meter', key: 'auto' } as const, DEFAULT_AUTO, { shape: 'auto-1' })
const snooze = atom({ plugin: 'context-meter', key: 'snooze' } as const, 0, { shape: 'snooze-1' })

let home: string | undefined
let isAsking = false
let lastRefresh = 0

/** At most one refresh per turn step in this many ms. */
const STEP_EVERY = 2000

const setAuto = async ($: EngineInterface, fn: (a: AutoSettings) => AutoSettings) => {
  await update($, auto, fn)
  await $.store.set('auto', await read($, auto))
}

async function refresh($: EngineInterface) {
  lastRefresh = await $.clock.now()
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
    ...(Number.isFinite(usage?.context.tokens) && Number.isFinite(usage?.context.window) && usage!.context.window > 0
      ? { measuredTokens: usage!.context.tokens, window: usage!.context.window }
      : {}),
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

/** Compacts now; the style is added by the session.compact hook below. */
async function compact($: EngineInterface, given?: string, note = 'Compacted.') {
  if (await read($, busy)) return
  await update($, busy, () => true)
  try {
    const instructions = (given ?? (await read($, focus))).trim()
    const r = await $.session.compact(instructions ? { instructions } : undefined)
    if ('skip' in r && r.skip) $.ui.toast(`Not compacted: ${r.skip}`)
    else $.ui.toast(note)
    await update($, focus, () => '')
  } catch (err) {
    $.ui.toast(`Couldn't compact: ${String(err)}`)
  } finally {
    await update($, busy, () => false)
    await refresh($)
  }
}

/** The window crossed the threshold: compact, or ask first. */
async function decide($: EngineInterface) {
  if (isAsking || (await read($, busy))) return
  const s = await read($, snapshot)
  const a = await read($, auto)
  if (!s || !isDue(s, a, await read($, snooze))) return
  const { tokens } = fillOf(s)
  const used = Math.round(usedShare(s) * 100)
  if (a.mode === 'auto') {
    await compact($, '', `Auto-compacted at ${used}% (your threshold is ${a.threshold}%).`)
    return
  }
  isAsking = true
  try {
    const now = 'Compact now'
    const later = `Ask again at ${Math.min(95, used + 10)}%`
    const off = 'Not this session'
    const answer = await $.ui.ask(
      `The context is at ${used}% (${fmtTokens(tokens)} tokens), past your ${a.threshold}% threshold. Compact now? Type under Other what the summary should keep.`,
      { options: [now, later, off], header: 'Context' },
    )
    if (answer === now) await compact($, '', `Compacted at ${used}%.`)
    else if (answer === later) await update($, snooze, () => Math.min(95, used + 10))
    else if (answer === off) await update($, snooze, () => 101)
    else await compact($, answer, `Compacted at ${used}%, keeping what you asked.`)
  } catch {
    // Dismissed: ask again five points on.
    await update($, snooze, () => Math.min(95, used + 5))
  } finally {
    isAsking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    home = await $.env.get('HOME').catch(() => undefined)
    const stored = await $.store.get('auto')
    if (stored && typeof stored === 'object') await update($, auto, () => ({ ...DEFAULT_AUTO, ...(stored as Partial<AutoSettings>) }))
    await $.command
      .register({ name: 'context-meter', description: 'What fills the context window, and a compact button' })
      .catch(err => $.ui.log(`context-meter: command not registered: ${String(err)}`, { to: 'debug' }))
    void refresh($).catch(() => undefined)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // Measure, then decide once the turn has let go of the session.
    void refresh($)
      .then(() => $.clock.after(1200, () => void decide($).catch(() => undefined)))
      .catch(() => undefined)
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (e.changed.includes('context')) void refresh($).catch(() => undefined)
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId) return r
    const now = await $.clock.now()
    if (now - lastRefresh >= STEP_EVERY) {
      lastRefresh = now
      void refresh($).catch(() => undefined)
    }
    return r
  })

  // Every compaction of the main conversation gets the chosen style: ours
  // always, /compact and Claude Code's own when `everywhere` is on.
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute') return next(e)
    const a = await read($, auto)
    const isOurs = e.trigger === 'plugin'
    const instructions = isOurs || a.everywhere ? joinInstructions(e.instructions, a) : e.instructions
    const r = await next(instructions === e.instructions ? e : { ...e, instructions })
    await update($, snooze, () => 0)
    void refresh($).catch(() => undefined)
    return r
  })

  // The compaction's own row. Seen even when another plugin answers
  // session.compact before ours (as an organization's security plugin can),
  // so /compact and Claude Code's own auto-compact always update the meter.
  // Measured a beat later, once the old messages have left the window.
  on('session.append', { door: 'compaction' }, async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      await update($, snooze, () => 0)
      $.clock.after(400, () => void refresh($).catch(() => undefined))
    }
    return r
  })

  on('command.run', { command: 'context-meter' }, async ($, e) => {
    const [verb = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (verb === 'auto') {
      if (arg === 'off') {
        await setAuto($, a => ({ ...a, threshold: null }))
        return { text: 'Auto-compact: off.' }
      }
      const n = Number.parseInt(arg, 10)
      if (!Number.isFinite(n) || n < 5 || n > 95) return { text: 'Usage: /context-meter auto 50 (5 to 95) · /context-meter auto off' }
      await setAuto($, a => ({ ...a, threshold: n }))
      await update($, snooze, () => 0)
      return { text: `Auto-compact at ${n}% of the window.` }
    }
    if (verb === 'ask' || verb === 'compact') {
      await setAuto($, a => ({ ...a, mode: verb === 'ask' ? 'ask' : 'auto' }))
      return { text: verb === 'ask' ? 'At the threshold, it will ask first.' : 'At the threshold, it will compact without asking.' }
    }
    if (verb === 'style') {
      const style = STYLES.find(s => s.value === arg)
      if (!style) return { text: `Styles: ${STYLES.map(s => s.value).join(', ')}` }
      await setAuto($, a => ({ ...a, style: style.value }))
      return { text: `Compact style: ${style.label}.` }
    }
    await refresh($)
    await openPane($)
    return { text: 'Context pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || !s) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const fill = fillOf(s)
    const used = usedShare(s) * 100
    const a = await read($, auto)
    const line = markOf(s, a)
    const state = contextState(s, line)
    return (
      <Box justifyContent="space-between" alignItems="center">
        <Box gap={1} alignItems="center">
          <Text dimColor>Context</Text>
          {slimBar($, e, partsOf(s), line, { width: 96, cells: 10, key: 'bar:ctx' })}
          <Text>{pct(used)}</Text>
          {chip($, e, state.label, state.tone)}
          <Text dimColor>
            {`${fmtTokens(fill.tokens)} of ${fmtTokens(fill.window)}${line !== null ? ` · ${a.threshold !== null ? 'auto-compact' : 'compacts'} at ${pct(line * 100)}` : ''}`}
          </Text>
        </Box>
        <Button key="details" plain dimColor label="Details" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
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

    const fill = fillOf(s)
    const used = usedShare(s) * 100
    const a = await read($, auto)
    const snoozed = await read($, snooze)
    const native = compactAt(s)
    const line = markOf(s, a)
    const state = contextState(s, line)
    const free = Math.max(0, s.rawMaxTokens - bufferTokens(s) - fill.tokens)
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

    const share = (n: number) => pct((n / fill.window) * 100)
    const total = (xs: Named[]) => xs.reduce((a, x) => a + x.tokens, 0)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Text size="heading" weight="semibold">
            {`${fmtTokens(fill.tokens)} of ${fmtTokens(fill.window)}`}
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
              {a.threshold !== null
                ? `The mark is your auto-compact at ${a.threshold}%${native !== null ? `; Claude Code's own is at ${pct(native * 100)}` : ''}.`
                : `The mark is where Claude Code auto-compacts (${pct(line * 100)} of the window).`}
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

        {/* Auto-compact: when, how it asks, and the summary's style. */}
        <Box flexDirection="column" marginTop={2}>
          <Box justifyContent="space-between" alignItems="center">
            <Text weight="semibold">Auto-compact</Text>
            <Text size="caption" dimColor>
              {a.threshold === null
                ? 'off'
                : snoozed > 100
                  ? 'paused for this session'
                  : snoozed > a.threshold
                    ? `asks again at ${snoozed}%`
                    : `at ${a.threshold}%`}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Compact earlier than Claude Code does, at a share of the window you pick.</Text>
          </Box>
          <Box marginTop={1} gap={1}>
            {[null, 20, 35, 50, 65, 80].map(n => (
              <Button
                key={`th:${n ?? 'off'}`}
                variant={a.threshold === n ? 'primary' : 'secondary'}
                label={n === null ? 'Off' : `${n}%`}
                onPress={() =>
                  void (async () => {
                    await setAuto($, x => ({ ...x, threshold: n }))
                    await update($, snooze, () => 0)
                  })()
                }
              />
            ))}
          </Box>
          {a.threshold !== null && (
            <Box marginTop={1} flexDirection="column">
              <Select
                key="mode"
                label="When it's reached"
                value={a.mode}
                options={[
                  { value: 'ask', label: 'Ask me first' },
                  { value: 'auto', label: 'Compact without asking' },
                ]}
                onSelect={v => void setAuto($, x => ({ ...x, mode: v === 'auto' ? 'auto' : 'ask' }))}
              />
            </Box>
          )}
          <Box marginTop={1} flexDirection="column">
            <Select
              key="style"
              label="Summary style"
              value={a.style}
              options={STYLES.map(st => ({ value: st.value, label: st.label }))}
              onSelect={v => void setAuto($, x => ({ ...x, style: v as Style }))}
            />
          </Box>
          {a.style === 'custom' && (
            <Box marginTop={1} flexDirection="column">
              <Input
                key="custom"
                rows={3}
                placeholder="Write the summary as a handoff: goal, decisions, files, next steps"
                value={a.custom}
                onInput={v => void setAuto($, x => ({ ...x, custom: v }))}
                onSubmit={v => void setAuto($, x => ({ ...x, custom: v }))}
              />
            </Box>
          )}
          {a.style !== 'default' && (
            <Box marginTop={1} justifyContent="space-between" alignItems="center">
              <Text dimColor>
                {a.everywhere ? 'Also used by /compact and Claude Code’s own auto-compact.' : 'Only used when this mod compacts.'}
              </Text>
              <Button
                key="everywhere"
                plain
                dimColor
                label={a.everywhere ? 'Only here' : 'Use everywhere'}
                onPress={() => void setAuto($, x => ({ ...x, everywhere: !x.everywhere }))}
              />
            </Box>
          )}
        </Box>

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
