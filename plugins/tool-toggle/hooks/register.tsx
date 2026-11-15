/**
 * tool-toggle: turn connectors, MCP servers and single tools on and off.
 *
 *   - claude.ai connectors are switched for real (the same switch as
 *     + › Connectors), so their tools leave the model's list
 *   - everything else is blocked at `tool.call`: the model still sees the
 *     tool, but a call to it is denied with a reason
 *   - /tools opens the pane; /tools on|off <name> and /tools list from the prompt
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ServerEntry, ToolEntry } from '../types'

const PANE = 'tool-toggle'
const STORE_KEY = 'disabled'
const STATUS_TOOL = 'mcp__ccd_connectors__session_connectors_status'
const SET_TOOL = 'mcp__ccd_connectors__set_session_connector_enabled'
// The mod drives connectors through this server: it is never turned off here.
const LOCKED = new Set(['ccd_connectors'])

// What is blocked: `mcp:<prefix>` a whole server, any other entry one tool.
const disabled = atom({ plugin: 'tool-toggle', key: 'disabled' } as const, [], { shape: 'disabled-1' })
const expanded = atom({ plugin: 'tool-toggle', key: 'expanded' } as const, [], { shape: 'expanded-2' })
const tools = atom({ plugin: 'tool-toggle', key: 'tools' } as const, [], { shape: 'tools-1' })
const servers = atom({ plugin: 'tool-toggle', key: 'servers' } as const, [], { shape: 'servers-1' })
const pending = atom({ plugin: 'tool-toggle', key: 'pending' } as const, [], { shape: 'pending-1' })
const query = atom({ plugin: 'tool-toggle', key: 'query' } as const, '', { shape: 'query-1' })

type Section = 'connector' | 'local' | 'app' | 'builtin'
type Group = {
  prefix: string // what tool names carry: mcp__<prefix>__<tool>
  name: string
  section: Section
  connector?: ServerEntry
  tools: ToolEntry[]
}

const serverOf = (name: string): string | null => /^mcp__(.+?)__/.exec(name)?.[1] ?? null
const toolPrefix = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '_')
const shortName = (t: ToolEntry) => (t.server ? t.name.slice(`mcp__${t.server}__`.length) : t.name)
const humanize = (s: string) =>
  s
    .replace(/^ccd_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())

const isBlocked = (off: string[], name: string): boolean => {
  const server = serverOf(name)
  return off.includes(name) || (server !== null && off.includes(`mcp:${server}`))
}

const textOf = (ran: { text?: string; result?: unknown }): string => {
  if (typeof ran.text === 'string') return ran.text
  const content = (ran.result as { content?: { type: string; text?: string }[] } | undefined)?.content
  return content?.map(c => c.text ?? '').join('') ?? ''
}

const save = async ($: EngineInterface, fn: (off: string[]) => string[]) => {
  await update($, disabled, off => [...new Set(fn(off))].sort())
  await $.store.set(STORE_KEY, await read($, disabled))
}

const refresh = async ($: EngineInterface) => {
  const [list, status] = await Promise.all([$.tool.list(), $.tool.call({ tool: STATUS_TOOL }).catch(() => null)])
  await update($, tools, () => list.map(t => ({ name: t.name, server: serverOf(t.name) })))
  if (status && status.deny === undefined) {
    try {
      const parsed = JSON.parse(textOf(status)) as { servers?: ServerEntry[] }
      if (Array.isArray(parsed.servers)) await update($, servers, () => parsed.servers ?? [])
    } catch {
      // Keep the last list.
    }
  }
}

const groupsOf = (all: ToolEntry[], srv: ServerEntry[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const s of srv) {
    const prefix = s.kind === 'connector' && s.id ? s.id : toolPrefix(s.name)
    groups.set(prefix, {
      prefix,
      name: s.name,
      section: s.kind === 'connector' ? 'connector' : 'local',
      connector: s.kind === 'connector' ? s : undefined,
      tools: [],
    })
  }
  for (const t of all) {
    const prefix = t.server ?? ''
    let g = groups.get(prefix)
    if (!g) {
      g = t.server
        ? { prefix, name: humanize(prefix), section: 'app', tools: [] }
        : { prefix: '', name: 'Built-in', section: 'builtin', tools: [] }
      groups.set(prefix, g)
    }
    g.tools.push(t)
  }
  for (const g of groups.values()) g.tools.sort((a, b) => shortName(a).localeCompare(shortName(b)))
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Whether a group is on: a connector by the session's switch, any other by the gate.
const isGroupOn = (g: Group, off: string[]) =>
  !off.includes(`mcp:${g.prefix}`) && (g.connector ? g.connector.status !== 'disabled' : true)

const setGroup = async ($: EngineInterface, g: Group, on: boolean) => {
  await save($, off => (on ? off.filter(x => x !== `mcp:${g.prefix}`) : [...off, `mcp:${g.prefix}`]))
  if (!g.connector) return

  // A connector is switched for real too: its tools leave the model's list.
  const id = g.connector.id ?? g.connector.name
  await update($, pending, p => [...p, g.prefix])
  try {
    const ran = await $.tool.call({ tool: SET_TOOL, connector: id, enabled: on })
    if (ran.deny !== undefined || ran.isError) {
      $.ui.toast(
        on
          ? `Couldn't turn ${g.name} on: use + › Connectors.`
          : `${g.name} is blocked; to disconnect it fully use + › Connectors.`,
      )
    }
  } catch {
    $.ui.toast(`Couldn't change ${g.name} for this session.`)
  } finally {
    await update($, pending, p => p.filter(x => x !== g.prefix))
    await refresh($)
  }
}

const findGroup = (word: string, gs: Group[]) => {
  const w = word.toLowerCase()
  return gs.find(g => g.section !== 'builtin' && (g.name.toLowerCase() === w || g.prefix.toLowerCase() === w))
}

const SECTIONS: { key: Section; title: string; isCollapsible: boolean }[] = [
  { key: 'connector', title: 'Connectors', isCollapsible: false },
  { key: 'local', title: 'MCP servers', isCollapsible: false },
  { key: 'app', title: 'App servers', isCollapsible: true },
  { key: 'builtin', title: 'Built-in tools', isCollapsible: true },
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(STORE_KEY)
    if (Array.isArray(stored)) {
      await update($, disabled, () => stored.filter((x): x is string => typeof x === 'string'))
    }
    await $.command.register({
      name: 'tools',
      description: 'Turn connectors, MCP servers and tools on or off',
      argumentHint: '[on|off <connector|tool>] | list',
    })
    const ran = await next(e)
    void refresh($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($)
    return next(e)
  })

  // The gate: a call to anything blocked never runs.
  on('tool.call', async ($, e, next) => {
    const off = await read($, disabled)
    if (isBlocked(off, e.tool)) {
      return {
        deny: `The user turned off "${e.tool}" with the tool-toggle mod. Don't retry it; use another tool or ask them to turn it on with /tools.`,
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'tools' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const word = rest.join(' ')

    if (verb === '') {
      await $.ui.open({ id: PANE, title: 'Tools' })
      void refresh($)
      return { text: 'Tools pane opened.' }
    }

    await refresh($)
    const off = await read($, disabled)
    const gs = groupsOf(await read($, tools), await read($, servers))

    if (verb === 'list') {
      const lines = gs
        .filter(g => g.section === 'connector' || g.section === 'local')
        .map(g => `- ${g.name}: ${isGroupOn(g, off) ? 'on' : 'off'}`)
      const loose = off.filter(x => !x.startsWith('mcp:'))
      return { text: [...lines, ...(loose.length ? [`Blocked tools: ${loose.join(', ')}`] : [])].join('\n') }
    }

    if (verb === 'on' || verb === 'off') {
      if (!word) return { text: `Usage: /tools ${verb} <connector|tool>` }
      const g = findGroup(word, gs)
      if (g) {
        if (LOCKED.has(g.prefix)) return { text: `${g.name} can't be turned off: this mod uses it.` }
        await setGroup($, g, verb === 'on')
        return { text: `${g.name}: ${verb}` }
      }
      const all = await read($, tools)
      const matches = all.filter(t => t.name === word || shortName(t) === word)
      if (matches.length !== 1) {
        return {
          text: matches.length ? `"${word}" is ambiguous: ${matches.map(t => t.name).join(', ')}` : `No connector or tool named "${word}".`,
        }
      }
      const name = matches[0]?.name ?? word
      await save($, o => (verb === 'off' ? [...o, name] : o.filter(x => x !== name)))
      return { text: `${shortName(matches[0] ?? { name, server: null })}: ${verb}` }
    }

    return { text: 'Usage: /tools · /tools list · /tools on <name> · /tools off <name>' }
  })


  // The pane. Desktop draws every Button as its own native control and drops
  // styling inside it, so state is shown beside the buttons, never in them:
  // a colored dot, the name as the expander, and a plain action on the right.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const off = await read($, disabled)
    const open = await read($, expanded)
    const busy = await read($, pending)
    const q = (await read($, query)).trim().toLowerCase()
    const gs = groupsOf(await read($, tools), await read($, servers))

    const toggleOpen = (k: string) => void update($, expanded, ex => (ex.includes(k) ? ex.filter(x => x !== k) : [...ex, k]))
    const dot = (isOn: boolean, isWarn = false) => (
      <Text color={isWarn ? 'warning' : isOn ? 'success' : 'inactive'}>{isOn || isWarn ? '●' : '○'}</Text>
    )

    const flipTool = (g: Group, t: ToolEntry) =>
      void (async () => {
        if (!isGroupOn(g, off)) {
          // The server goes on with every other tool of it left off.
          await save($, o => [...o, ...g.tools.filter(x => x.name !== t.name).map(x => x.name)])
          await setGroup($, g, true)
          return
        }
        await save($, o => (o.includes(t.name) ? o.filter(x => x !== t.name) : [...o, t.name]))
      })()

    const toolRow = (g: Group, t: ToolEntry, label: string, indent: number) => {
      const isOn = isGroupOn(g, off) && !off.includes(t.name)
      return (
        <Box key={`row:${t.name}`} justifyContent="space-between" alignItems="center" paddingLeft={indent} paddingRight={1} hover={{ backgroundColor: 'subtle' }}>
          <Box gap={1} alignItems="center">
            {dot(isOn)}
            <Text mono size="footnote" dimColor={!isOn}>
              {label}
            </Text>
          </Box>
          <Button key={`tool:${t.name}`} plain dimColor={isOn} label={isOn ? 'Block' : 'Allow'} onPress={() => flipTool(g, t)} />
        </Box>
      )
    }

    const detailOf = (g: Group, isOn: boolean) => {
      const status = g.connector?.status
      if (status === 'needs_auth') return 'needs sign-in'
      if (status === 'failed') return 'failed to connect'
      if (busy.includes(g.prefix)) return 'switching…'
      if (!isOn) return g.connector ? 'off for this session' : 'blocked'
      if (g.tools.length === 0) return 'connecting…'
      const blocked = g.tools.filter(t => off.includes(t.name)).length
      return `${g.tools.length} tools${blocked ? ` · ${blocked} blocked` : ''}`
    }

    const groupRow = (g: Group) => {
      const k = g.prefix || 'builtin'
      const isOpen = open.includes(k)
      const isOn = isGroupOn(g, off)
      const isWarn = g.connector?.status === 'needs_auth' || g.connector?.status === 'failed'
      const canOpen = g.tools.length > 0
      return (
        <Box key={`g:${k}`} flexDirection="column">
          <Box key={`gh:${k}`} justifyContent="space-between" alignItems="center" paddingX={1} hover={{ backgroundColor: 'subtle' }}>
            <Box gap={1} alignItems="center">
              {dot(isOn, isWarn)}
              {canOpen ? (
                <Button key={`exp:${k}`} plain label={`${g.name} ${isOpen ? '▾' : '▸'}`} onPress={() => toggleOpen(k)} />
              ) : (
                <Text dimColor={!isOn}>{g.name}</Text>
              )}
              <Text dimColor size="caption">
                {detailOf(g, isOn)}
              </Text>
            </Box>
            {!LOCKED.has(g.prefix) && (
              <Button
                key={`srv:${g.prefix}`}
                plain
                dimColor={isOn}
                label={isOn ? 'Turn off' : 'Turn on'}
                onPress={() => void setGroup($, g, !isOn)}
              />
            )}
          </Box>
          {isOpen && g.tools.map(t => toolRow(g, t, shortName(t), 4))}
        </Box>
      )
    }

    const section = (key: Section, title: string, isCollapsible: boolean) => {
      const list = gs.filter(g => g.section === key)
      if (list.length === 0) return null
      const isBuiltin = key === 'builtin'
      const isOpen = !isCollapsible || open.includes(`section:${key}`)
      const items = isBuiltin ? list.flatMap(g => g.tools) : []
      const onCount = isBuiltin ? items.filter(t => !off.includes(t.name)).length : list.filter(g => isGroupOn(g, off)).length
      const total = isBuiltin ? items.length : list.length
      return (
        <Box key={`s:${key}`} flexDirection="column" marginTop={1}>
          <Box key={`sh:${key}`} justifyContent="space-between" alignItems="center" paddingX={1}>
            {isCollapsible ? (
              <Button key={`section:${key}`} plain label={`${title} ${isOpen ? '▾' : '▸'}`} onPress={() => toggleOpen(`section:${key}`)} />
            ) : (
              <Text weight="semibold">{title}</Text>
            )}
            <Text dimColor size="caption">
              {onCount} of {total} on
            </Text>
          </Box>
          {isOpen && (
            <Box key={`sb:${key}`} flexDirection="column" borderStyle="round" borderDimColor>
              {isBuiltin ? list.flatMap(g => g.tools.map(t => toolRow(g, t, t.name, 1))) : list.map(groupRow)}
            </Box>
          )}
        </Box>
      )
    }

    const results = q
      ? gs.flatMap(g =>
          g.tools.filter(t => shortName(t).toLowerCase().includes(q) || g.name.toLowerCase().includes(q)).map(t => ({ g, t })),
        )
      : []
    const connectors = gs.filter(g => g.section === 'connector')
    const onConnectors = connectors.filter(g => isGroupOn(g, off)).length
    const blockedTools = off.filter(x => !x.startsWith('mcp:')).length

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Text weight="semibold" size="heading">
              {onConnectors} of {connectors.length} connectors on
            </Text>
            <Text dimColor size="caption">
              {blockedTools ? `${blockedTools} tool${blockedTools === 1 ? '' : 's'} blocked` : 'No single tools blocked'}
            </Text>
          </Box>
          <Box gap={2}>
            {off.length > 0 && <Button key="all-on" plain dimColor label="Unblock all" onPress={() => void save($, () => [])} />}
            <Button key="refresh" plain dimColor label="Refresh" onPress={() => void refresh($)} />
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Input
            key="q"
            placeholder="Search tools and connectors"
            value={q}
            onInput={v => void update($, query, () => v)}
            onSubmit={v => void update($, query, () => v)}
          />
        </Box>
        {gs.length === 0 && <Text dimColor>Loading…</Text>}
        {q ? (
          <Box key="results" flexDirection="column" marginTop={1} borderStyle="round" borderDimColor>
            {results.length === 0 && (
              <Box paddingX={1}>
                <Text dimColor size="footnote">
                  Nothing matches "{q}".
                </Text>
              </Box>
            )}
            {results.slice(0, 80).map(({ g, t }) => toolRow(g, t, `${g.name} · ${shortName(t)}`, 1))}
          </Box>
        ) : (
          <Box flexDirection="column">{SECTIONS.map(s => section(s.key, s.title, s.isCollapsible))}</Box>
        )}
      </Box>
    )
  })
}
