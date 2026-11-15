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

/** Compares dotted versions: positive when `a` is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
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
