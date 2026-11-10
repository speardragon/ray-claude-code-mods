// Keeps the atoms the line draws from current: the session's figures, the repository, its pull request.
// Each refresh writes only what changed, so a quiet minute redraws nothing.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionRateLimit, SessionUsage } from 'claude-code'

import type { FableReading, Git, LimitWindow, PullRequestReading, Usage } from '../types'
import { fetchFable, isFable } from './fable'
import { readGit } from './git'
import { fetchPullRequest } from './pr'
import { isSame } from './same'

// The same values register.tsx draws from; the validator reads each atom where it is used.
const usageAtom = atom({ plugin: 'status-line', key: 'usage' } as const, null as Usage | null)
const gitAtom = atom({ plugin: 'status-line', key: 'git' } as const, null as Git | null)
const prAtom = atom({ plugin: 'status-line', key: 'pr' } as const, null as PullRequestReading | null)
const fableAtom = atom({ plugin: 'status-line', key: 'fable' } as const, null as FableReading | null)

const MINUTE_MS = 60_000
// A pull request is asked about again every three minutes; sooner while GitHub is still working out
// whether it merges, and at once after a push or a `gh pr` command.
const PR_REFRESH_MS = 3 * MINUTE_MS
const PR_UNKNOWN_RETRY_MS = 20_000
const BACKOFF_MS = 5 * MINUTE_MS
// The usage endpoint is asked at most once in five minutes, and only while the model is Fable.
const FABLE_REFRESH_MS = 5 * MINUTE_MS
const BACKOFF_CAP_MS = 60 * MINUTE_MS

// `last` outlives a /clear, which empties the atom: the reading is put back without asking again.
type FablePolicy = { hasPlan: boolean; isFetching: boolean; attemptedAt: number; retryAt: number; failures: number; last?: FableReading }

type PullRequestPolicy = { isStale: boolean; isFetching: boolean; retryAt: number; failures: number }

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

function windowOf(rateLimits: readonly SessionRateLimit[], kind: string): LimitWindow | undefined {
  const found = rateLimits.find(limit => limit.kind === kind)
  if (found === undefined) return undefined
  return { percentUsed: found.percentUsed, ...(found.resetsAt !== undefined ? { resetsAt: found.resetsAt } : {}) }
}

export function usageOf(model: string, usage: SessionUsage, now: number): Usage {
  const { tokens, window, percent } = usage.context
  const fiveHour = windowOf(usage.rateLimits, 'five_hour')
  const sevenDay = windowOf(usage.rateLimits, 'seven_day')
  return {
    model,
    context: { window, ...(tokens !== undefined ? { tokens } : {}), ...(percent !== undefined ? { percent } : {}) },
    ...(fiveHour ? { fiveHour } : {}),
    ...(sevenDay ? { sevenDay } : {}),
    minute: Math.floor(now / MINUTE_MS),
  }
}

// Calls that arrive while one runs are folded into a single run after it.
function createGate(): (work: () => Promise<void>) => Promise<void> {
  let running: Promise<void> | undefined
  let waiting: Promise<void> | undefined
  const run = (work: () => Promise<void>) => {
    running = work().finally(() => (running = undefined))
    return running
  }
  return work => {
    if (running === undefined) return run(work)
    waiting ??= running.then(() => {
      waiting = undefined
      return run(work)
    })
    return waiting
  }
}

// The module's own bookkeeping; a reload starts it over.
const usageGate = createGate()
const gitGate = createGate()
let policy: PullRequestPolicy = { isStale: false, isFetching: false, retryAt: 0, failures: 0 }

let fablePolicy: FablePolicy = { hasPlan: true, isFetching: false, attemptedAt: Number.NEGATIVE_INFINITY, retryAt: 0, failures: 0 }

// After a push or a `gh pr` command the pull request is asked about on the next git read.
export function markPullRequestStale(): void {
  policy = { ...policy, isStale: true, retryAt: 0 }
}

function isPullRequestDue(key: string, reading: PullRequestReading | null, now: number): boolean {
  if (policy.isFetching || now < policy.retryAt) return false
  if (reading?.key !== key || policy.isStale) return true
  return now - reading.fetchedAt >= (reading.isMergeUnknown ? PR_UNKNOWN_RETRY_MS : PR_REFRESH_MS)
}

async function refreshPullRequest($: EngineInterface, key: string, account: string, now: number): Promise<void> {
  policy = { ...policy, isFetching: true, isStale: false }
  try {
    const reading = await fetchPullRequest($, key, account, now)
    await update($, prAtom, () => reading)
    policy = { ...policy, failures: 0, retryAt: 0 }
  } catch (error) {
    const failures = policy.failures + 1
    policy = { ...policy, failures, retryAt: now + Math.min(BACKOFF_MS * 2 ** (failures - 1), BACKOFF_CAP_MS) }
    $.ui.log(`status-line: pull request not read: ${describe(error)}`, { to: 'debug' })
  } finally {
    policy = { ...policy, isFetching: false }
  }
}

async function refreshFable($: EngineInterface, now: number): Promise<void> {
  const { last } = fablePolicy
  const current = await read($, fableAtom)
  if (current === null && last !== undefined) await update($, fableAtom, () => last)
  // A reload starts the policy over but keeps the atom: its reading's age counts too.
  const lastAskedAt = Math.max(fablePolicy.attemptedAt, current?.fetchedAt ?? Number.NEGATIVE_INFINITY)
  const isDue = fablePolicy.hasPlan && !fablePolicy.isFetching && now >= fablePolicy.retryAt
  if (!isDue || now - lastAskedAt < FABLE_REFRESH_MS) return
  fablePolicy = { ...fablePolicy, isFetching: true, attemptedAt: now }
  try {
    const reading = await fetchFable($, now)
    if (reading === null) {
      fablePolicy = { ...fablePolicy, hasPlan: false }
      return
    }
    await update($, fableAtom, () => reading)
    fablePolicy = { ...fablePolicy, failures: 0, retryAt: 0, last: reading }
  } catch (error) {
    const failures = fablePolicy.failures + 1
    fablePolicy = { ...fablePolicy, failures, retryAt: now + Math.min(BACKOFF_MS * 2 ** (failures - 1), BACKOFF_CAP_MS) }
    $.ui.log(`status-line: Fable limit not read: ${describe(error)}`, { to: 'debug' })
  } finally {
    fablePolicy = { ...fablePolicy, isFetching: false }
  }
}

async function readUsage($: EngineInterface): Promise<void> {
  try {
    const [model, figures, now, current] = await Promise.all([
      $.session.model(),
      $.session.usage(),
      $.clock.now(),
      read($, usageAtom),
    ])
    const next = usageOf(model, figures, now)
    if (!isSame(current, next)) await update($, usageAtom, () => next)
    if (isFable(model)) await refreshFable($, now)
  } catch (error) {
    $.ui.log(`status-line: usage not read: ${describe(error)}`, { to: 'debug' })
  }
}

async function readRepository($: EngineInterface, account: string): Promise<void> {
  try {
    const [next, now, current, reading] = await Promise.all([readGit($), $.clock.now(), read($, gitAtom), read($, prAtom)])
    // A push or pull from another terminal moves ahead/behind: the pull request has likely moved too.
    if (current !== null && !isSame(current.upstream, next?.upstream)) markPullRequestStale()
    if (!isSame(current, next)) await update($, gitAtom, () => next)
    if (next?.prKey !== undefined && isPullRequestDue(next.prKey, reading, now)) {
      void refreshPullRequest($, next.prKey, account, now)
    }
  } catch (error) {
    // A passing failure (a timeout) keeps the last reading, so the row does not blink.
    $.ui.log(`status-line: git not read: ${describe(error)}`, { to: 'debug' })
  }
}

export function refreshUsage($: EngineInterface): Promise<void> {
  return usageGate(() => readUsage($))
}

export function refreshGit($: EngineInterface, account: string): Promise<void> {
  return gitGate(() => readRepository($, account))
}
