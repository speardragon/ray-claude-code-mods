// The values this mod keeps in $.state, by key. Every key the hooks module names is checked against this.

// One plan-limit window: how much is used, and when it starts over.
export type LimitWindow = { percentUsed: number; resetsAt?: string }

// What the model is asked to think with: not known before the first request, absent on a model without effort.
export type Effort = { kind: 'unknown' } | { kind: 'none' } | { kind: 'level'; level: string }

// The session's figures at one minute. `minute` moves the countdowns along even when nothing else changes.
export type Usage = {
  model: string
  context: { tokens?: number; window: number; percent?: number }
  fiveHour?: LimitWindow
  sevenDay?: LimitWindow
  minute: number
}

export type GitOperation = 'rebasing' | 'merging' | 'cherry-picking' | 'reverting' | 'bisecting'

// The repository the session stands in. `path` is the working tree's root, the home folder as `~`.
// No `branch` means a detached HEAD, which `commit` names. `upstream` is kept only to notice a push or
// pull made elsewhere.
export type Git = {
  path: string
  branch?: string
  commit?: string
  operation?: GitOperation
  upstream?: { ahead: number; behind: number }
  // What the pull request of this branch is looked up by: root, origin's owner and branch.
  prKey?: string
}

export type PullRequest = {
  number: number
  url: string
  state: 'open' | 'draft' | 'merged' | 'closed'
  merge?: 'clean' | 'conflict' | 'behind'
  checks?: 'pass' | 'fail' | 'pending'
  review?: 'approved' | 'changes' | 'required'
}

// The last answer about a branch's pull request; `value` is absent when the branch has none.
export type PullRequestReading = {
  key: string
  fetchedAt: number
  isMergeUnknown: boolean
  value?: PullRequest
}

// The last answer about the Fable-only weekly limit; `window` is absent when the plan has none.
export type FableReading = { fetchedAt: number; window?: LimitWindow }

declare module 'claude-code' {
  interface PluginState {
    'status-line': {
      usage: Usage | null
      effort: Effort
      git: Git | null
      pr: PullRequestReading | null
      fable: FableReading | null
    }
  }
}
