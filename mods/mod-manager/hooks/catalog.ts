// The installed plugins as `claude plugin list --json` reports them, narrowed to the ones that
// apply in this project: user-scope installs and the project's own, one row per plugin, the
// narrowest scope winning (local over project over user), as Claude Code itself resolves them.
import type { ModCommand, ModEntry, ModScope } from '../types'

export type Installed = {
  id: string
  version?: string
  scope: string
  enabled: boolean
  installPath: string
  projectPath?: string
}

const RANK: Record<string, number> = { local: 3, project: 2, user: 1 }

export function parseList(json: string): Installed[] {
  const data: unknown = JSON.parse(json)
  if (!Array.isArray(data)) return []
  return data.filter(
    (row): row is Installed =>
      typeof row === 'object' && row !== null && typeof (row as Installed).id === 'string' && typeof (row as Installed).installPath === 'string',
  )
}

export function applicable(list: Installed[], cwd: string): Installed[] {
  const here = list.filter(row => row.scope === 'user' || (row.projectPath !== undefined && row.projectPath === cwd))
  const best = new Map<string, Installed>()
  for (const row of here) {
    const kept = best.get(row.id)
    if (!kept || (RANK[row.scope] ?? 0) > (RANK[kept.scope] ?? 0)) best.set(row.id, row)
  }
  return [...best.values()]
}

export function splitId(id: string) {
  const at = id.lastIndexOf('@')
  return at > 0 ? { name: id.slice(0, at), marketplace: id.slice(at + 1) } : { name: id, marketplace: '' }
}

// A hooks.json naming at least one hooks module: the plugin is a mod.
export function namesModules(hooksJson: string | null): boolean {
  if (!hooksJson) return false
  try {
    const data = JSON.parse(hooksJson) as { modules?: unknown }
    return Array.isArray(data.modules) && data.modules.length > 0
  } catch {
    return false
  }
}

export function describe(pluginJson: string | null): { description: string; version: string } {
  if (!pluginJson) return { description: '', version: '' }
  try {
    const data = JSON.parse(pluginJson) as { description?: unknown; version?: unknown }
    return {
      description: typeof data.description === 'string' ? data.description : '',
      version: typeof data.version === 'string' ? data.version : '',
    }
  } catch {
    return { description: '', version: '' }
  }
}

export function entry(
  row: { id: string; scope: ModScope; enabled: boolean; root: string; version?: string },
  files: { hooksJson: string | null; pluginJson: string | null },
  commands: ModCommand[],
): ModEntry {
  const { name, marketplace } = splitId(row.id)
  const meta = describe(files.pluginJson)
  return {
    id: row.id,
    name,
    marketplace,
    version: row.version || meta.version,
    scope: row.scope,
    enabled: row.enabled,
    isMod: namesModules(files.hooksJson),
    description: meta.description,
    root: row.root,
    commands,
  }
}

// Mods first, then by marketplace and name; this session's own mods last.
export function sortEntries(list: ModEntry[]): ModEntry[] {
  const group = (e: ModEntry) => (e.scope === 'session' ? 'zzzz' : e.marketplace)
  return [...list].sort((a, b) => group(a).localeCompare(group(b)) || a.name.localeCompare(b.name))
}
