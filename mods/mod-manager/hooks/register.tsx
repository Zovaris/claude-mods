/**
 * mod-manager: /mods, a pane over every installed mod, theme and plugin.
 *
 *   - reads Claude Code's own files (installed plugins, enabled plugins in
 *     user settings, known marketplaces and their catalogs); writes none
 *   - acts through the `claude plugin` command (enable, disable, update,
 *     install, marketplace update), so Claude Code does the writing
 *   - a change loads with /reload-plugins, which the pane offers to run
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, Kind } from '../types'
import { compareVersions, idParts, isNewer, kindOf, SECTION_TITLE } from './catalog'
import type { Installed, Manifest, MarketPlugin } from './catalog'
import { chip } from './slim'

const PANE = 'mod-manager'
const entries = atom({ plugin: 'mod-manager', key: 'entries' } as const, [], { shape: 'entries-1' })
const busy = atom({ plugin: 'mod-manager', key: 'busy' } as const, null, { shape: 'busy-1' })
const open = atom({ plugin: 'mod-manager', key: 'open' } as const, ['mod', 'theme'], { shape: 'open-1' })
const note = atom({ plugin: 'mod-manager', key: 'note' } as const, '', { shape: 'note-1' })
const dirty = atom({ plugin: 'mod-manager', key: 'dirty' } as const, false, { shape: 'dirty-1' })

let configDir = ''
let canReload = true
let claudeBin: string | null = null

async function readJson<T>($: EngineInterface, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function exists($: EngineInterface, path: string): Promise<boolean> {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

/** The `claude` command: on PATH, else the desktop app's newest bundled copy. */
async function findClaude($: EngineInterface): Promise<string | null> {
  try {
    const r = await $.process.run(['/bin/sh', '-lc', 'command -v claude'], { timeoutMs: 5000 })
    const path = r.stdout.trim()
    if (r.exitCode === 0 && path) return path
  } catch {
    // no shell, or not on PATH
  }
  const home = await $.env.get('HOME').catch(() => undefined)
  if (!home) return null
  const root = `${home}/Library/Application Support/Claude/claude-code`
  try {
    const versions = (await $.fs.list(root)).filter(v => v.kind === 'dir').map(v => v.name).sort(compareVersions).reverse()
    for (const v of versions) {
      for (const h of (await $.fs.list(`${root}/${v}`)).filter(x => x.kind === 'dir')) {
        const bin = `${root}/${v}/${h.name}/claude.app/Contents/MacOS/claude`
        if (await exists($, bin)) return bin
      }
    }
  } catch {
    // not the desktop app's layout
  }
  return null
}

async function refresh($: EngineInterface) {
  const installed = (await readJson<{ plugins?: Installed }>($, `${configDir}/plugins/installed_plugins.json`))?.plugins ?? {}
  const enabled = (await readJson<{ enabledPlugins?: Record<string, boolean> }>($, `${configDir}/settings.json`))?.enabledPlugins ?? {}
  const markets = (await readJson<Record<string, { installLocation?: string }>>($, `${configDir}/plugins/known_marketplaces.json`)) ?? {}

  // What each marketplace offers: its catalog, and each plugin's own manifest there.
  const offered = new Map<string, { mp: MarketPlugin; manifest: Manifest | null; hasModules: boolean }>()
  for (const [mk, info] of Object.entries(markets)) {
    const loc = info.installLocation
    if (!loc) continue
    const catalog = await readJson<{ plugins?: MarketPlugin[] }>($, `${loc}/.claude-plugin/marketplace.json`)
    for (const mp of catalog?.plugins ?? []) {
      const src = typeof mp.source === 'string' ? `${loc}/${mp.source.replace(/^\.\//, '')}` : null
      const manifest = src ? await readJson<Manifest>($, `${src}/.claude-plugin/plugin.json`) : null
      const hooks = src ? await readJson<{ modules?: unknown[] }>($, `${src}/hooks/hooks.json`) : null
      offered.set(`${mp.name}@${mk}`, { mp, manifest, hasModules: Array.isArray(hooks?.modules) })
    }
  }

  const list: Entry[] = []
  const ids = new Set([...Object.keys(installed), ...offered.keys()])
  for (const id of ids) {
    const { name, marketplace } = idParts(id)
    const inst = installed[id]?.[0]
    const off = offered.get(id)
    const own = inst?.installPath ? await readJson<Manifest>($, `${inst.installPath}/.claude-plugin/plugin.json`) : null
    const ownHooks = inst?.installPath ? await readJson<{ modules?: unknown[] }>($, `${inst.installPath}/hooks/hooks.json`) : null
    list.push({
      id,
      name,
      marketplace,
      kind: kindOf({
        category: off?.mp.category,
        keywords: off?.mp.keywords ?? own?.keywords,
        hasModules: Array.isArray(ownHooks?.modules) || (off?.hasModules ?? false),
      }),
      description: own?.description ?? off?.mp.description ?? off?.manifest?.description ?? '',
      installed: inst !== undefined,
      enabled: inst !== undefined && enabled[id] !== false,
      version: inst?.version ?? own?.version ?? null,
      latest: off?.manifest?.version ?? null,
      scope: inst?.scope ?? null,
    })
  }
  list.sort((a, b) => a.name.localeCompare(b.name))
  await update($, entries, () => list)
}

/** Runs `claude plugin …`, then reads the files again. */
async function run($: EngineInterface, label: string, args: string[]): Promise<boolean> {
  if (await read($, busy)) return false
  await update($, busy, () => label)
  try {
    claudeBin ??= await findClaude($)
    if (!claudeBin) {
      await $.ui.copy({ text: `claude ${args.join(' ')}` }).catch(() => undefined)
      await update($, note, () => `Couldn't find the claude command. "claude ${args.join(' ')}" is on your clipboard: run it in a terminal.`)
      return false
    }
    const r = await $.process.run([claudeBin, ...args], { timeoutMs: 180_000 })
    const out = (r.stdout + r.stderr).trim().split('\n').filter(Boolean).pop() ?? ''
    if (r.exitCode === 0) {
      await update($, note, () => out.replace(/^✔\s*/, ''))
      await update($, dirty, () => true)
      return true
    }
    await update($, note, () => `Failed: ${out || `exit ${r.exitCode}`}`)
    return false
  } catch (err) {
    await update($, note, () => `Failed: ${String(err)}`)
    return false
  } finally {
    await update($, busy, () => null)
    await refresh($)
  }
}

/**
 * Turns a mod or theme on or off, or installs it. Only one look draws at a time
 * (the last one set wins), so turning a theme on turns the other themes off.
 *
 * Enabling a plugin only takes effect when plugins load, and a desktop
 * session can't reload them. So a theme is also switched live: turned on with
 * its own `/<name> on` when this session has it loaded, and the look cleared
 * when a theme is turned off. What can't switch live says it waits for a new
 * session.
 */
async function choose($: EngineInterface, x: Entry, verb: 'enable' | 'disable' | 'install') {
  if (verb !== 'disable' && x.kind === 'theme') {
    const others = (await read($, entries)).filter(o => o.kind === 'theme' && o.installed && o.enabled && o.id !== x.id)
    for (const o of others) await run($, `Turning ${o.name} off…`, ['plugin', 'disable', o.id])
  }
  const label = verb === 'enable' ? 'Enabling' : verb === 'disable' ? 'Disabling' : 'Installing'
  const ok = await run($, `${label} ${x.name}…`, ['plugin', verb, x.id])
  if (!ok || x.kind !== 'theme') return
  if (verb === 'disable') {
    await $.theme.clear().catch(() => undefined)
    await update($, note, () => `${x.name} is off.`)
    return
  }
  const live = await $.command
    .run({ command: x.name, args: 'on' })
    .then(r => !!r && !/not available|unknown command/i.test(r.text ?? ''))
    .catch(() => false)
  await update($, note, () => (live ? `${x.name} is on.` : `${x.name} is on from your next session.`))
}

/** Loads plugin changes now, where the session can; else says when they load. */
async function reload($: EngineInterface) {
  await update($, dirty, () => false)
  const r = await $.command.run({ command: 'reload-plugins' }).catch(() => undefined)
  if (!r || /isn't available|not available/i.test(r.text ?? '')) {
    canReload = false
    await update($, note, () => 'This session can’t reload plugins: changes load in your next session.')
  }
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Mods' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const dir = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)
    const home = await $.env.get('HOME').catch(() => undefined)
    configDir = dir ?? (home ? `${home}/.claude` : '.claude')
    await $.command
      .register({ name: 'mods', description: 'Your mods, themes and plugins: on, off, update, install' })
      .catch(err => $.ui.log(`mod-manager: /mods not registered: ${String(err)}`, { to: 'debug' }))
    return r
  })

  on('command.run', { command: 'mods' }, async $ => {
    await refresh($)
    await openPane($)
    return { text: 'Mods pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, entries)
    const working = await read($, busy)
    const opened = await read($, open)
    const message = await read($, note)
    const needsReload = await read($, dirty)
    const toggle = (k: string) => void update($, open, o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))

    const installed = list.filter(x => x.installed)
    const updates = installed.filter(isNewer)
    const available = list.filter(x => !x.installed)

    const row = (x: Entry) => {
      const newer = isNewer(x)
      return (
        <Box key={`row:${x.id}`} flexDirection="column">
          <Box justifyContent="space-between" alignItems="center">
            <Box alignItems="center">
              <Box width={2}>
                <Text color={!x.installed ? 'inactive' : x.enabled ? 'success' : 'inactive'}>{x.installed ? '●' : '○'}</Text>
              </Box>
              <Text weight="medium" dimColor={x.installed && !x.enabled}>
                {x.name}
              </Text>
              <Text size="caption" dimColor>
                {`  ${x.version ? `v${x.version}` : x.latest ? `v${x.latest}` : ''}${x.marketplace ? ` · ${x.marketplace}` : ''}`}
              </Text>
            </Box>
            <Box gap={1} alignItems="center">
              {newer && chip($, e, `v${x.latest} available`, 'cool')}
              {newer && (
                <Button key={`update:${x.id}`} label="Update" onPress={() => void run($, `Updating ${x.name}…`, ['plugin', 'update', x.id])} />
              )}
              {x.installed ? (
                <Button
                  key={`switch:${x.id}`}
                  plain
                  dimColor
                  label={x.enabled ? 'Disable' : 'Enable'}
                  onPress={() => void choose($, x, x.enabled ? 'disable' : 'enable')}
                />
              ) : (
                <Button key={`install:${x.id}`} label="Install" onPress={() => void choose($, x, 'install')} />
              )}
            </Box>
          </Box>
          {x.description && (
            <Box paddingLeft={2}>
              <Text size="caption" dimColor>
                {x.description}
              </Text>
            </Box>
          )}
        </Box>
      )
    }

    const section = (k: string, title: string, items: Entry[], aside: string) => {
      if (items.length === 0) return null
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
            <Box flexDirection="column" marginTop={1} rowGap={1}>
              {items.map(row)}
            </Box>
          )}
        </Box>
      )
    }

    const kinds: Kind[] = ['mod', 'theme', 'plugin']
    const markets = [...new Set(list.map(x => x.marketplace).filter(Boolean))]

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Text size="heading" weight="semibold">
              {`${installed.length} installed`}
            </Text>
            <Text size="caption" dimColor>
              {`${installed.filter(x => x.enabled).length} on · ${updates.length ? `${updates.length} update${updates.length === 1 ? '' : 's'}` : 'all up to date'}${available.length ? ` · ${available.length} more available` : ''}`}
            </Text>
          </Box>
          <Box gap={1}>
            {markets.length > 0 && (
              <Button
                key="check"
                variant="secondary"
                label="Check for updates"
                onPress={() =>
                  void (async () => {
                    for (const mk of markets) await run($, `Checking ${mk}…`, ['plugin', 'marketplace', 'update', mk])
                  })()
                }
              />
            )}
          </Box>
        </Box>

        {(working || message || needsReload) && (
          <Box marginTop={2} justifyContent="space-between" alignItems="center">
            <Text dimColor>{working ?? message}</Text>
            {needsReload && canReload && !working && (
              <Button
                key="reload"
                label="Reload plugins"
                onPress={() => void reload($)}
              />
            )}
          </Box>
        )}

        {list.length === 0 && (
          <Box marginTop={2}>
            <Text dimColor>No plugins installed yet, and no marketplace added.</Text>
          </Box>
        )}

        {kinds.map(k => {
          const items = installed.filter(x => x.kind === k)
          return section(k, SECTION_TITLE[k], items, `${items.filter(x => x.enabled).length} of ${items.length} on`)
        })}
        {section('available', 'Available', available, `${available.length} from your marketplaces`)}
      </Box>
    )
  })
}
