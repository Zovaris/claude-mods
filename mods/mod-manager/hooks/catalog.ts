/**
 * The pure half of mod-manager: turning Claude Code's own plugin files into
 * one list, no `$`. What the files hold:
 *
 *   plugins/installed_plugins.json   { plugins: { "<name>@<mk>": [{ scope, installPath, version }] } }
 *   settings.json                    { enabledPlugins: { "<name>@<mk>": true | false } }
 *   plugins/known_marketplaces.json  { "<mk>": { installLocation } }
 *   <installLocation>/.claude-plugin/marketplace.json   { plugins: [{ name, source, category, description }] }
 */
import type { Entry, Kind } from '../types'

export type Installed = Record<string, { scope?: string; installPath?: string; version?: string }[]>
export type MarketPlugin = { name: string; source?: unknown; category?: string; description?: string; keywords?: string[] }
export type Manifest = { version?: string; description?: string; keywords?: string[] }

const SEMVER = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Orders two prerelease tags the semver way: numbers by value, and a longer tag after its prefix. */
function comparePre(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d
    } else if (nx !== ny) return nx ? -1 : 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Compares versions: positive when `a` is newer. A prerelease (`1.0.0-beta.1`)
 * comes before its release, build metadata (`+abc`) and a leading `v` count
 * for nothing, and a version that isn't dotted numbers (a commit hash) can't
 * be ordered, so it compares equal rather than newer.
 */
export function compareVersions(a: string, b: string): number {
  const ma = SEMVER.exec(a.trim())
  const mb = SEMVER.exec(b.trim())
  if (!ma || !mb) return 0
  const pa = ma[1]!.split('.').map(Number)
  const pb = mb[1]!.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  if (ma[2] === undefined || mb[2] === undefined) return ma[2] === mb[2] ? 0 : ma[2] === undefined ? 1 : -1
  return comparePre(ma[2], mb[2])
}

/** A theme says so in its category or keywords; a mod ships a hooks module; the rest are plugins. */
export function kindOf(opts: { category?: string; keywords?: string[]; hasModules: boolean }): Kind {
  if (opts.category === 'theme' || opts.keywords?.includes('theme')) return 'theme'
  return opts.hasModules ? 'mod' : 'plugin'
}

export const idParts = (id: string) => {
  const at = id.lastIndexOf('@')
  return at > 0 ? { name: id.slice(0, at), marketplace: id.slice(at + 1) } : { name: id, marketplace: '' }
}

export const isNewer = (e: Entry) => e.installed && e.version !== null && e.latest !== null && compareVersions(e.latest, e.version) > 0

export const SECTION_TITLE: Record<Kind, string> = { mod: 'Mods', theme: 'Themes', plugin: 'Other plugins' }
