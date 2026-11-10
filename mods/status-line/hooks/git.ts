// The repository the session stands in, read with git itself: where it is, the branch, the operation under way.
import type { EngineInterface } from 'claude-code'

import type { Git, GitOperation } from '../types'

const TIMEOUT_MS = 10_000
const OID_PREFIX = '# branch.oid '
const HEAD_PREFIX = '# branch.head '
const DETACHED = '(detached)'
const SHORT_OID = 7

// A marker file in the git directory names the operation under way.
const OPERATIONS: readonly (readonly [string, GitOperation])[] = [
  ['rebase-merge', 'rebasing'],
  ['rebase-apply', 'rebasing'],
  ['MERGE_HEAD', 'merging'],
  ['CHERRY_PICK_HEAD', 'cherry-picking'],
  ['REVERT_HEAD', 'reverting'],
  ['BISECT_LOG', 'bisecting'],
]

type Parsed = { oid: string; head: string; upstream?: { ahead: number; behind: number } }

function readLine(parsed: Parsed, line: string): Parsed {
  if (line.startsWith(OID_PREFIX)) return { ...parsed, oid: line.slice(OID_PREFIX.length) }
  if (line.startsWith(HEAD_PREFIX)) return { ...parsed, head: line.slice(HEAD_PREFIX.length) }
  const ab = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line)
  return ab ? { ...parsed, upstream: { ahead: Number(ab[1]), behind: Number(ab[2]) } } : parsed
}

// The header of `git status --porcelain=v2 --branch`: the branch (or the commit of a detached HEAD)
// and how far it is from its upstream.
export function parseStatus(text: string): Pick<Git, 'branch' | 'commit' | 'upstream'> {
  const parsed = text.split('\n').reduce(readLine, { oid: '', head: '' })
  const isDetached = parsed.head === DETACHED || parsed.head === ''
  return {
    ...(isDetached ? { commit: parsed.oid.slice(0, SHORT_OID) } : { branch: parsed.head }),
    ...(parsed.upstream ? { upstream: parsed.upstream } : {}),
  }
}

// A path under the home folder starts with `~`; any other is left whole.
export function tildePath(path: string, home: string | undefined): string {
  const trimmed = path.replace(/\/+$/, '') || '/'
  const base = (home ?? '').replace(/\/+$/, '')
  if (base === '') return trimmed
  if (trimmed === base) return '~'
  return trimmed.startsWith(`${base}/`) ? `~${trimmed.slice(base.length)}` : trimmed
}

// The owner in https://host/<owner>/<repo>.git, git@host:<owner>/<repo>.git or ssh://git@host/<owner>/<repo>.
export function remoteOwner(remote: string | null): string | undefined {
  const match = remote === null ? null : /[/:]([^/:]+)\/[^/:]+?(?:\.git)?\/?$/.exec(remote)
  return match?.[1]
}

// Optional locks are off so a read never contends with the model's own git commands for index.lock.
async function runGit($: EngineInterface, args: readonly string[]): Promise<string | undefined> {
  const { exitCode, stdout } = await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: TIMEOUT_MS })
  return exitCode === 0 ? stdout : undefined
}

// A worktree's git directory may be outside what the session can read: then only the operation mark is lost.
async function operationIn($: EngineInterface, gitDir: string): Promise<GitOperation | undefined> {
  try {
    const found = await Promise.all(OPERATIONS.map(([marker]) => $.fs.exists(`${gitDir}/${marker}`)))
    return OPERATIONS.find((_, index) => found[index] === true)?.[1]
  } catch {
    return undefined
  }
}

// Null outside a repository. A failure to run git at all throws, so the caller keeps its last reading.
export async function readGit($: EngineInterface): Promise<Git | null> {
  const repo = await $.session.repo()
  if (repo === null) return null
  const [status, paths, home] = await Promise.all([
    runGit($, ['status', '--porcelain=v2', '--branch', '--untracked-files=no']),
    runGit($, ['rev-parse', '--path-format=absolute', '--git-dir', '--show-toplevel']).catch(() => undefined),
    $.env.get('HOME').catch(() => undefined),
  ])
  if (status === undefined) return null
  const [gitDir = '', top = ''] = (paths ?? '').split('\n')
  const operation = gitDir === '' ? undefined : await operationIn($, gitDir)
  const parsed = parseStatus(status)
  const owner = remoteOwner(repo.remote)
  return {
    // A linked worktree shows its own folder, not the main working tree's.
    path: tildePath(top === '' ? repo.root : top, home),
    ...(operation ? { operation } : {}),
    ...parsed,
    ...(parsed.branch !== undefined && owner !== undefined ? { prKey: [repo.root, owner, parsed.branch].join('\n') } : {}),
  }
}
