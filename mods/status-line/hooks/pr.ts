// The pull request of the branch the session is on, asked of GitHub through the gh CLI.
import type { EngineInterface } from 'claude-code'

import type { PullRequest, PullRequestReading } from '../types'
import { T } from './theme'

const TIMEOUT_MS = 15_000
// --head matches the branch name alone, so a fork's branch of the same name comes too: take a few
// and keep the one whose head belongs to origin's owner.
const LIST_LIMIT = 10
const FIELDS = 'number,url,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,headRepositoryOwner'
const QUIET = { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }
const PASSED = ['SUCCESS', 'NEUTRAL', 'SKIPPED']
const WAITING = ['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', '']

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

// One failed check fails them all; else one still running is pending; else they passed.
function checksOf(rollup: unknown): PullRequest['checks'] {
  const results = (Array.isArray(rollup) ? rollup.filter(isRecord) : []).map(check => {
    // A CheckRun has status and conclusion, a StatusContext has state.
    const value = String(check.conclusion ?? check.state ?? '')
    if (check.status !== undefined && check.status !== 'COMPLETED') return 'pending'
    if (PASSED.includes(value)) return 'pass'
    return WAITING.includes(value) ? 'pending' : 'fail'
  })
  if (results.length === 0) return undefined
  if (results.includes('fail')) return 'fail'
  return results.includes('pending') ? 'pending' : 'pass'
}

function stateOf(row: Json): PullRequest['state'] | undefined {
  if (row.state === 'MERGED') return 'merged'
  if (row.state === 'CLOSED') return 'closed'
  if (row.state === 'OPEN') return row.isDraft === true ? 'draft' : 'open'
  return undefined
}

function mergeOf(row: Json): PullRequest['merge'] {
  if (row.mergeable === 'CONFLICTING' || row.mergeStateStatus === 'DIRTY') return 'conflict'
  if (row.mergeStateStatus === 'BEHIND') return 'behind'
  return row.mergeStateStatus === 'CLEAN' || row.mergeStateStatus === 'HAS_HOOKS' ? 'clean' : undefined
}

function reviewOf(row: Json): PullRequest['review'] {
  if (row.reviewDecision === 'APPROVED') return 'approved'
  if (row.reviewDecision === 'CHANGES_REQUESTED') return 'changes'
  return row.reviewDecision === 'REVIEW_REQUIRED' ? 'required' : undefined
}

// One row of `gh pr list --json`, as what the line shows.
export function pullRequestOf(row: Json): PullRequest | undefined {
  const state = stateOf(row)
  if (state === undefined || typeof row.number !== 'number' || typeof row.url !== 'string') return undefined
  const base: PullRequest = { number: row.number, url: row.url, state }
  if (state === 'merged' || state === 'closed') return base
  const merge = mergeOf(row)
  const checks = checksOf(row.statusCheckRollup)
  const review = reviewOf(row)
  return { ...base, ...(merge ? { merge } : {}), ...(checks ? { checks } : {}), ...(review ? { review } : {}) }
}

// The number's color is the state: draft grey, blocked (conflict, failed checks, changes requested)
// red, approved and mergeable green, anything else still open orange; merged purple, closed faint.
export function pullRequestColor(pr: PullRequest): string {
  if (pr.state === 'merged') return T.merged
  if (pr.state === 'closed') return T.faint
  if (pr.state === 'draft') return T.muted
  if (pr.merge === 'conflict' || pr.checks === 'fail' || pr.review === 'changes') return T.status.critical
  if (pr.review === 'approved' && pr.merge === 'clean' && pr.checks !== 'pending') return T.status.good
  return T.status.serious
}

function ownRow(rows: unknown, owner: string): Json | undefined {
  return (Array.isArray(rows) ? rows.filter(isRecord) : []).find(row => {
    const head = row.headRepositoryOwner
    return isRecord(head) && typeof head.login === 'string' && head.login.toLowerCase() === owner.toLowerCase()
  })
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

// With several gh accounts logged in the active one drifts; a named account's token pins the call to it.
async function tokenEnv($: EngineInterface, account: string): Promise<Record<string, string>> {
  if (account === '') return {}
  const { exitCode, stdout, stderr } = await $.process.run(
    ['gh', 'auth', 'token', '--hostname', 'github.com', '--user', account],
    { timeoutMs: TIMEOUT_MS, env: QUIET },
  )
  const token = stdout.trim()
  if (exitCode !== 0 || token === '') throw new Error(firstLine(stderr) || `no gh token for ${account}`)
  return { GH_TOKEN: token }
}

// The newest pull request (closed and merged ones too) whose head is this branch in origin's owner's
// repository. Throws when gh is missing, logged out or the remote is not on GitHub.
export async function fetchPullRequest(
  $: EngineInterface,
  key: string,
  account: string,
  now: number,
): Promise<PullRequestReading> {
  const [, owner = '', branch = ''] = key.split('\n')
  const env = { ...QUIET, ...(await tokenEnv($, account)) }
  const { exitCode, stdout, stderr } = await $.process.run(
    ['gh', 'pr', 'list', '--head', branch, '--state', 'all', '--limit', String(LIST_LIMIT), '--json', FIELDS],
    { timeoutMs: TIMEOUT_MS, env },
  )
  if (exitCode !== 0) throw new Error(firstLine(stderr) || `gh exited ${exitCode}`)
  const row = ownRow(JSON.parse(stdout), owner)
  const value = row === undefined ? undefined : pullRequestOf(row)
  return {
    key,
    fetchedAt: now,
    isMergeUnknown: row?.state === 'OPEN' && row.mergeable === 'UNKNOWN',
    ...(value ? { value } : {}),
  }
}
