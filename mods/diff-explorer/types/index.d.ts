// A file Claude (or one of its subagents) changed this session.
export type Tracked = {
  path: string // absolute
  before: string | null // the text before Claude's first edit this session; null: the file did not exist
  isTooBig: boolean // the earlier text was too long to keep, so no diff is drawn
  at: number // when it last changed, ms
  edits: number // how many edits landed on it
}

// What the preview column shows.
export type View = 'diff' | 'file'

// The tree column: follow the pane's width, or forced on or off.
export type TreeMode = 'auto' | 'shown' | 'hidden'

// Where each column's own window starts, in rows.
// `x` is how far the preview is scrolled sideways, in cells, while lines are not wrapped.
export type Scroll = { tree: number; preview: number; x: number }

declare module 'claude-code' {
  interface PluginState {
    'diff-explorer': {
      files: Tracked[]
      selected: string | null
      view: View
      wrap: boolean
      tree: TreeMode
      collapsed: string[]
      scroll: Scroll
      cwd: string
    }
  }
}
