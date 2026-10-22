// Where a plugin is installed, or `session` for a mod this session hot-reloads from its own folder.
export type ModScope = 'user' | 'project' | 'local' | 'session'

// A slash command a plugin registered: how its panel, if it has one, is opened.
export type ModCommand = { name: string; description: string }

// One installed plugin, as the pane lists it.
export type ModEntry = {
  id: string // name@marketplace; the name alone for a session mod
  name: string
  marketplace: string
  version: string
  scope: ModScope
  enabled: boolean
  isMod: boolean // carries a hooks module (hooks/hooks.json `modules`): a mod, not only skills or MCP
  description: string
  root: string // where its files are
  commands: ModCommand[]
}

export type Filter = 'mods' | 'all'

// Where the list's and the detail's windows start; the detail's offset is for one entry.
export type Scroll = { list: number; detail: number; detailFor: string | null }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': {
      entries: ModEntry[]
      loadedAt: number
      selected: string | null
      filter: Filter
      scroll: Scroll
      busy: string
      note: string
      needsReload: boolean
    }
  }
}
