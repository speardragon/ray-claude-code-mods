// The tool calls the person unfolded (by tool_use_id), or folded back while all are unfolded.
export type Flipped = string[]

// One call in the panel's list; its input and result stay in the module (hooks/calls.ts).
export type CallRef = { id: string; tool: string; state: 'running' | 'done' | 'error'; startedAt: number; endedAt?: number; agentId?: string }

// Where the panel's list and detail windows start; the detail's offset is for one call.
export type PanelScroll = { list: number; detail: number; detailFor: string | null }

declare module 'claude-code' {
  interface PluginState {
    'tool-fold': {
      enabled: boolean
      unfoldAll: boolean
      flipped: Flipped
      calls: CallRef[]
      picked: string | null
      follow: boolean
      pscroll: PanelScroll
    }
  }
}
