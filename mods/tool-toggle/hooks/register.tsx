/**
 * tool-toggle: turn connectors, MCP servers and single tools on and off.
 *
 *   - claude.ai connectors are switched for real (the same switch as
 *     + › Connectors), so their tools leave the model's list
 *   - everything else is blocked at `tool.call`: the model still sees the
 *     tool, but a call to it is denied with a reason
 *   - skills are blocked three ways: left out of the listing the model reads,
 *     denied at the Skill tool, and their text replaced if one is run by name
 *   - /tools opens the pane; /tools on|off <name> and /tools list from the prompt
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ServerEntry, SkillEntry, ToolEntry } from '../types'

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
const skills = atom({ plugin: 'tool-toggle', key: 'skills' } as const, [], { shape: 'skills-1' })

// A skill is blocked as `skill:<name>`.
const skillKey = (name: string) => `skill:${name}`
const SKILL_OFF = (name: string) =>
  `The user turned off the "${name}" skill with the tool-toggle mod. Don't use it; go on without it, or ask them to turn it on with /tools.`

/** The skill listing the model reads, without the skills that are off. */
function withoutSkills(text: string, off: Set<string>): string {
  if (off.size === 0) return text
  const lines = text.split('\n')
  const out: string[] = []
  let isDropping = false
  for (const line of lines) {
    const m = /^- ([^:\s]+):/.exec(line)
    if (m) isDropping = off.has(m[1] ?? '')
    else if (/^\S/.test(line)) isDropping = false
    if (!isDropping) out.push(line)
  }
  return out.join('\n')
}

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
  const [list, status, usage] = await Promise.all([
    $.tool.list(),
    $.tool.call({ tool: STATUS_TOOL }).catch(() => null),
    $.session.usage({ breakdown: 'summary' }).catch(() => undefined),
  ])
  await update($, tools, () => list.map(t => ({ name: t.name, server: serverOf(t.name) })))
  const listed = usage?.context.breakdown?.skills?.skillFrontmatter
  if (listed) {
    const known = new Map((await read($, skills)).map(s => [s.name, s]))
    for (const s of listed) known.set(s.name, { name: s.name, source: String(s.source), pluginName: s.pluginName })
    await update($, skills, () => [...known.values()].sort((a, b) => a.name.localeCompare(b.name)))
  }
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

const SECTIONS: { key: Section; title: string }[] = [
  { key: 'connector', title: 'Connectors' },
  { key: 'local', title: 'MCP servers' },
  { key: 'app', title: 'App servers' },
  { key: 'builtin', title: 'Built-in tools' },
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
    if (e.tool === 'Skill' && off.includes(skillKey(e.skill))) return { deny: SKILL_OFF(e.skill) }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A skill run by name (/name, a preload) reads a notice instead of its text.
  on('skill.prompt', async ($, e, next) => {
    const off = await read($, disabled)
    return off.includes(skillKey(e.skill)) ? { text: SKILL_OFF(e.skill) } : next(e)
  })

  // The listing of skills the model reads leaves out the ones that are off.
  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const off = new Set((await read($, disabled)).filter(x => x.startsWith('skill:')).map(x => x.slice(6)))
    if (off.size === 0 || typeof e.text !== 'string') return next(e)
    return next({ ...e, text: withoutSkills(e.text, off) })
  })

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
      const loose = off.filter(x => !x.startsWith('mcp:') && !x.startsWith('skill:'))
      const offSkills = off.filter(x => x.startsWith('skill:')).map(x => x.slice(6))
      return {
        text: [
          ...lines,
          ...(loose.length ? [`Blocked tools: ${loose.join(', ')}`] : []),
          ...(offSkills.length ? [`Skills off: ${offSkills.join(', ')}`] : []),
        ].join('\n'),
      }
    }

    if (verb === 'on' || verb === 'off') {
      if (!word) return { text: `Usage: /tools ${verb} <connector|tool|skill>` }
      // A skill by name, or `skill:<name>` when a tool shares it.
      const skillName = word.startsWith('skill:') ? word.slice(6) : word
      const isSkill = (await read($, skills)).some(s => s.name === skillName)
      if (isSkill && (word.startsWith('skill:') || !findGroup(word, gs))) {
        await save($, o => (verb === 'off' ? [...o, skillKey(skillName)] : o.filter(x => x !== skillKey(skillName))))
        return { text: `Skill ${skillName}: ${verb}` }
      }
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
          text: matches.length
            ? `"${word}" is ambiguous: ${matches.map(t => t.name).join(', ')}`
            : `No connector, tool or skill named "${word}".`,
        }
      }
      const name = matches[0]?.name ?? word
      await save($, o => (verb === 'off' ? [...o, name] : o.filter(x => x !== name)))
      return { text: `${shortName(matches[0] ?? { name, server: null })}: ${verb}` }
    }

    return { text: 'Usage: /tools · /tools list · /tools on <name> · /tools off <name>' }
  })


  // The pane. Desktop draws a Button as its own native control (a chip, or
  // plain text when `plain`) and drops styling inside it, so state lives
  // beside the buttons: a dot in a fixed column, the name, then the action.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const off = await read($, disabled)
    const open = await read($, expanded)
    const busy = await read($, pending)
    const q = (await read($, query)).trim().toLowerCase()
    const gs = groupsOf(await read($, tools), await read($, servers))
    const skillList = await read($, skills)

    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
    const sourceOf = (s: SkillEntry) =>
      s.pluginName ??
      ({ userSettings: 'user', projectSettings: 'project', policySettings: 'managed', 'built-in': 'built-in', mcp: 'MCP' } as Record<string, string>)[
        s.source
      ] ??
      s.source

    // Skills, grouped by where they come from; a plugin's prefix (`plugin:`) is dropped in its group.
    const skillLabel = (s: SkillEntry) => (s.pluginName && s.name.startsWith(`${s.pluginName}:`) ? s.name.slice(s.pluginName.length + 1) : s.name)
    const flipSkill = (name: string, turnOn: boolean) =>
      void save($, o => (turnOn ? o.filter(x => x !== skillKey(name)) : [...o, skillKey(name)]))

    const skillRow = (s: SkillEntry, label: string, indent: number) => {
      const isOn = !off.includes(skillKey(s.name))
      return (
        <Box key={`skill:${s.name}`} justifyContent="space-between" alignItems="center" paddingLeft={indent} paddingRight={1}>
          <Box alignItems="center">
            <Box width={2}>
              <Text color={isOn ? 'success' : 'inactive'}>●</Text>
            </Box>
            <Text mono size="footnote" dimColor={!isOn}>
              {label}
            </Text>
          </Box>
          <Button key={`sk:${s.name}`} plain dimColor label={isOn ? 'Turn off' : 'Turn on'} onPress={() => flipSkill(s.name, !isOn)} />
        </Box>
      )
    }

    const skillGroups = () => {
      const groups = new Map<string, SkillEntry[]>()
      for (const sk of skillList) groups.set(sourceOf(sk), [...(groups.get(sourceOf(sk)) ?? []), sk])
      return [...groups.entries()].sort(([a], [b]) => (a === 'user' ? -1 : b === 'user' ? 1 : a.localeCompare(b)))
    }

    const skillGroupRow = ([source, items]: [string, SkillEntry[]]) => {
      const k = `skills:${source}`
      const isOpen = open.includes(k)
      const onCount = items.filter(sk => !off.includes(skillKey(sk.name))).length
      const allOn = onCount === items.length
      return (
        <Box key={`sg:${source}`} flexDirection="column">
          <Box justifyContent="space-between" alignItems="center" paddingX={1}>
            <Box alignItems="center">
              {dot(onCount === 0 ? 'off' : 'on')}
              <Box width={18}>
                <Text weight="medium" dimColor={onCount === 0}>
                  {source}
                </Text>
              </Box>
              <Button
                key={`exp:${k}`}
                plain
                dimColor
                label={`${onCount === items.length ? plural(items.length, 'skill') : `${onCount} of ${items.length} on`} ${isOpen ? '▾' : '▸'}`}
                onPress={() => toggleOpen(k)}
              />
            </Box>
            <Button
              key={`all:${k}`}
              label={allOn ? 'Disable' : 'Enable'}
              onPress={() =>
                void save($, o =>
                  allOn ? [...o, ...items.map(sk => skillKey(sk.name))] : o.filter(x => !items.some(sk => skillKey(sk.name) === x)),
                )
              }
            />
          </Box>
          {isOpen && (
            <Box flexDirection="column" marginTop={1}>
              {items.map(sk => skillRow(sk, skillLabel(sk), 3))}
            </Box>
          )}
        </Box>
      )
    }

    // Every section folds; Connectors and MCP servers start open.
    const startsOpen = (key: string) => key === 'connector' || key === 'local'
    const isSectionOpen = (key: string) => (startsOpen(key) ? !open.includes(`closed:${key}`) : open.includes(`section:${key}`))
    const flipSection = (key: string) => toggleOpen(startsOpen(key) ? `closed:${key}` : `section:${key}`)

    const sectionHead = (key: string, title: string, aside: string) => (
      <Box key={`sh:${key}`} justifyContent="space-between" alignItems="center" paddingX={1}>
        <Text weight="semibold">{title}</Text>
        <Box gap={2} alignItems="center">
          <Text size="caption" dimColor>
            {aside}
          </Text>
          <Button key={`section:${key}`} plain dimColor label={isSectionOpen(key) ? 'Hide' : 'Show'} onPress={() => flipSection(key)} />
        </Box>
      </Box>
    )

    const skillsSection = () => {
      if (skillList.length === 0) return null
      const onCount = skillList.filter(sk => !off.includes(skillKey(sk.name))).length
      return (
        <Box key="s:skills" flexDirection="column" marginTop={2}>
          {sectionHead('skills', 'Skills', `${onCount} of ${skillList.length} on`)}
          {isSectionOpen('skills') && (
            <Box key="sb:skills" flexDirection="column" marginTop={1} rowGap={1}>
              {skillGroups().map(skillGroupRow)}
            </Box>
          )}
        </Box>
      )
    }
    const toggleOpen = (k: string) => void update($, expanded, ex => (ex.includes(k) ? ex.filter(x => x !== k) : [...ex, k]))
    const dot = (tone: 'on' | 'off' | 'warn') => (
      <Box width={2}>
        <Text color={tone === 'on' ? 'success' : tone === 'warn' ? 'warning' : 'inactive'}>●</Text>
      </Box>
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
        <Box key={`row:${t.name}`} justifyContent="space-between" alignItems="center" paddingLeft={indent} paddingRight={1}>
          <Box alignItems="center">
            {dot(isOn ? 'on' : 'off')}
            <Text mono size="footnote" dimColor={!isOn}>
              {label}
            </Text>
          </Box>
          <Button key={`tool:${t.name}`} plain dimColor label={isOn ? 'Block' : 'Allow'} onPress={() => flipTool(g, t)} />
        </Box>
      )
    }

    const groupRow = (g: Group) => {
      const k = g.prefix || 'builtin'
      const isOpen = open.includes(k)
      const isOn = isGroupOn(g, off)
      const status = g.connector?.status
      const isWarn = status === 'needs_auth' || status === 'failed'
      const blocked = g.tools.filter(t => off.includes(t.name)).length
      const note = isWarn
        ? status === 'needs_auth'
          ? 'Needs sign-in'
          : 'Failed to connect'
        : busy.includes(g.prefix)
          ? 'Switching…'
          : !isOn
            ? 'Off'
            : g.tools.length === 0
              ? 'Connecting…'
              : null
      return (
        <Box key={`g:${k}`} flexDirection="column">
          <Box key={`gh:${k}`} justifyContent="space-between" alignItems="center" paddingX={1}>
            <Box alignItems="center">
              {dot(isWarn ? 'warn' : isOn ? 'on' : 'off')}
              <Box width={18}>
                <Text weight="medium" dimColor={!isOn}>
                  {g.name}
                </Text>
              </Box>
              {note !== null ? (
                <Text size="caption" dimColor>
                  {note}
                </Text>
              ) : (
                <Button
                  key={`exp:${k}`}
                  plain
                  dimColor
                  label={`${plural(g.tools.length, 'tool')}${blocked ? `, ${blocked} blocked` : ''} ${isOpen ? '▾' : '▸'}`}
                  onPress={() => toggleOpen(k)}
                />
              )}
            </Box>
            {!LOCKED.has(g.prefix) && (
              <Button key={`srv:${g.prefix}`} label={isOn ? 'Disable' : 'Enable'} onPress={() => void setGroup($, g, !isOn)} />
            )}
          </Box>
          {isOpen && isOn && (
            <Box flexDirection="column" marginTop={1}>
              {g.tools.map(t => toolRow(g, t, shortName(t), 3))}
            </Box>
          )}
        </Box>
      )
    }

    const section = (key: Section, title: string) => {
      const list = gs.filter(g => g.section === key)
      if (list.length === 0) return null
      const isBuiltin = key === 'builtin'
      const items = isBuiltin ? list.flatMap(g => g.tools) : []
      const onCount = isBuiltin ? items.filter(t => !off.includes(t.name)).length : list.filter(g => isGroupOn(g, off)).length
      const total = isBuiltin ? items.length : list.length
      return (
        <Box key={`s:${key}`} flexDirection="column" marginTop={2}>
          {sectionHead(key, title, `${onCount} of ${total} on`)}
          {isSectionOpen(key) && (
            <Box key={`sb:${key}`} flexDirection="column" marginTop={1} rowGap={isBuiltin ? 0 : 1}>
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
    const skillResults = q ? skillList.filter(sk => sk.name.toLowerCase().includes(q)) : []
    const connectors = gs.filter(g => g.section === 'connector')
    const onConnectors = connectors.filter(g => isGroupOn(g, off)).length
    const blockedTools = off.filter(x => !x.startsWith('mcp:')).length
    const totalTools = gs.reduce((a, g) => a + (isGroupOn(g, off) ? g.tools.filter(t => !off.includes(t.name)).length : 0), 0)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Text size="heading" weight="semibold">
              {onConnectors} of {connectors.length} connectors on
            </Text>
            <Text size="caption" dimColor>
              {totalTools} tools available{blockedTools ? ` · ${plural(blockedTools, 'tool')} blocked` : ''}
            </Text>
          </Box>
          <Box gap={1}>
            {off.length > 0 && <Button key="all-on" variant="secondary" label="Unblock all" onPress={() => void save($, () => [])} />}
            <Button key="refresh" variant="secondary" label="Refresh" onPress={() => void refresh($)} />
          </Box>
        </Box>
        <Box marginTop={2} flexDirection="column">
          <Input
            key="q"
            placeholder="Search"
            value={q}
            onInput={v => void update($, query, () => v)}
            onSubmit={v => void update($, query, () => v)}
          />
        </Box>
        {gs.length === 0 && <Text dimColor>Loading…</Text>}
        {q ? (
          <Box key="results" flexDirection="column" marginTop={1}>
            {results.length === 0 && skillResults.length === 0 && (
              <Box paddingX={1}>
                <Text dimColor size="footnote">
                  Nothing matches "{q}".
                </Text>
              </Box>
            )}
            {skillResults.slice(0, 40).map(sk => skillRow(sk, sk.name, 1))}
            {results.slice(0, 80).map(({ g, t }) => toolRow(g, t, `${g.name} · ${shortName(t)}`, 1))}
          </Box>
        ) : (
          <Box flexDirection="column">
            {SECTIONS.map(s => section(s.key, s.title))}
            {skillsSection()}
          </Box>
        )}
      </Box>
    )
  })
}
