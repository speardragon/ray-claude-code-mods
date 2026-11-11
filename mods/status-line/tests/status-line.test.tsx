import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, RenderSurface, SessionUsage, TurnStepInput } from 'claude-code'

import { effortFrom, isModelSwitch } from '../hooks/effort'
import { formatTokens, prettyModel, resetIn } from '../hooks/format'
import { fableOf } from '../hooks/fable'
import { parseStatus, remoteOwner, tildePath } from '../hooks/git'
import { gitRows, rowText, rowWidth, statusRows } from '../hooks/layout'
import { pullRequestColor, pullRequestOf } from '../hooks/pr'
import { textWidth, truncate } from '../hooks/text'
import { T, statusOf } from '../hooks/theme'
import type { Git, Usage } from '../types'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const FIVE_RESET = '2026-11-10T14:13:00Z'
const WEEK_RESET = '2026-11-13T16:00:00Z'
const ENGINE_LINE = '? for shortcuts'
const HOME = '/Users/ray'
const ROOT = `${HOME}/dev/acme-web`
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const REMOTE = 'git@github.com:acme/acme-web.git'
const OID = '1234567890abcdef1234567890abcdef12345678'
const PR_URL = 'https://github.com/acme/acme-web/pull/12'

const LIMITS = '5h ━━━─────── 28%  ↻2h13m · 7d ━━━━────── 42%  ↻3d'
const CONTEXT = 'ctx ━━──────── 23%  46k/200k'
const MODEL = '✻ Opus 5.5  effort ?'
const HEAD_ROW = MODEL
const METERS_ROW = LIMITS
const FEATURE_STATUS = [
  `# branch.oid ${OID}`,
  '# branch.head feature/bar',
  '# branch.upstream origin/feature/bar',
  '# branch.ab +2 -1',
  '# stash 1',
  '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
  '1 M. N... 100644 100644 100644 aaa bbb src/b.ts',
  '1 MM N... 100644 100644 100644 aaa bbb src/c.ts',
  '1 .D N... 100644 100644 000000 aaa bbb src/d.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 src/e.ts\tsrc/old.ts',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc src/f.ts',
  '? notes.md',
  '',
].join('\n')

// What the plan's usage endpoint answers: the windows, and a weekly limit scoped to Fable.
const usageBody = (fablePercent?: number) =>
  JSON.stringify({
    limits: [
      { kind: 'session', percent: 28, resets_at: FIVE_RESET },
      { kind: 'weekly_all', percent: 42, resets_at: WEEK_RESET },
      { kind: 'weekly_scoped', percent: 99, resets_at: WEEK_RESET, scope: { model: { display_name: 'Opus' } } },
      ...(fablePercent === undefined ? [] : [{ kind: 'weekly_scoped', percent: fablePercent, resets_at: WEEK_RESET, scope: { model: { display_name: 'Fable' } } }]),
    ],
  })

const usageOf = (tokens?: number): SessionUsage => ({
  startedAt: NOW,
  context: { window: 200_000, ...(tokens !== undefined ? { tokens, percent: Math.round((tokens / 200_000) * 100) } : {}) },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 28, resetsAt: FIVE_RESET },
    { kind: 'seven_day', percentUsed: 42, resetsAt: WEEK_RESET },
  ],
})

type World = {
  model: string
  usage: SessionUsage
  settings: Record<string, unknown>
  repo?: { status: string; paths?: string; markers?: string[] }
  prs: unknown[]
  isGhFailing: boolean
  auth: { handle: string; kind: 'bearer' | 'api-key' } | null
  answers: { status: number; text: string }[]
}

// The engine beneath the mod: each hook answers as the engine would.
function setUp(on: On, initial: Partial<World> = {}) {
  const world: World = { model: 'claude-opus-5-5', usage: usageOf(46_000), settings: {}, prs: [], isGhFailing: false, auth: { handle: 'auth_test', kind: 'bearer' }, answers: [], ...initial }
  const clock = mock.clock(on, { now: NOW })
  const runs: { argv: string[]; env?: Record<string, string> }[] = []
  const ran = (exitCode: number, stdout: string, stderr = '') => ({
    value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('session.model', () => ({ value: world.model }))
  on('session.usage', () => ({ value: world.usage }))
  on('session.repo', () => ({
    value: world.repo === undefined ? null : { root: ROOT, remote: REMOTE, internal: false, name: null },
  }))
  on('settings.read', () => ({ value: world.settings }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  const fetches: { url: string; auth?: string; beta?: string }[] = []
  on('session.authorize', () => ({ value: world.auth }))
  on('http.fetch', (_, e) => {
    fetches.push({ url: e.url, ...(e.init?.auth ? { auth: e.init.auth } : {}), ...(e.init?.headers?.['anthropic-beta'] ? { beta: e.init.headers['anthropic-beta'] } : {}) })
    const answer = world.answers.shift() ?? { status: 200, text: usageBody(60) }
    return { value: { status: answer.status, ok: answer.status >= 200 && answer.status < 300, headers: {}, text: answer.text } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: (world.repo?.markers ?? []).some(marker => e.path.endsWith(`/${marker}`)) }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('ui.render', () => ({ type: 'Box', children: [ENGINE_LINE] }))
  on('process.run', (_, e) => {
    runs.push({ argv: [...e.argv], ...(e.init?.env ? { env: e.init.env } : {}) })
    const [command, ...args] = e.argv
    if (command === 'open') return ran(0, '')
    if (command === 'gh' && args[0] === 'auth') return ran(0, 'token-of-the-account\n')
    if (command === 'gh') return world.isGhFailing ? ran(1, '', 'gh: not logged in') : ran(0, JSON.stringify(world.prs))
    if (command !== 'git' || world.repo === undefined) return ran(128, '', 'fatal: not a git repository')
    if (args.includes('status')) return ran(0, world.repo.status)
    return ran(0, world.repo.paths ?? `${ROOT}/.git\n${ROOT}\n`)
  })

  return { world, clock, runs, fetches }
}

const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const

const childrenOf = (node: RenderElement | string): readonly (RenderElement | string)[] =>
  typeof node !== 'string' && 'children' in node ? (node.children ?? []) : []

const textOf = (node: RenderElement | string): string => (typeof node === 'string' ? node : childrenOf(node).map(textOf).join(''))

async function drawn($: Engine, options: { columns?: number; surface?: RenderSurface } = {}): Promise<RenderElement> {
  const ui = await $.ui.mount({
    plugin: 'status-line',
    surface: options.surface ?? 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: ENGINE_LINE },
    viewport: { columns: (options.columns ?? 160) + 4, rows: 40, isFullscreen: true },
  })
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

// The rows under the engine's own line, which must still be the first thing drawn.
async function rows($: Engine, options: { columns?: number; surface?: RenderSurface } = {}): Promise<string[]> {
  const [own = '', box] = childrenOf(await drawn($, options))
  expect(textOf(own)).toBe(ENGINE_LINE)
  return box === undefined ? [] : childrenOf(box).map(textOf)
}

async function step($: Engine, request: { effort?: TurnStepInput['effort']; agentId?: string }): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, messageCount: 1, model: 'claude-opus-5-5', ...request })
  let chunk = await stream.next()
  while (chunk.done !== true) chunk = await stream.next()
}

const openPr = { number: 12, url: PR_URL, state: 'OPEN', isDraft: false, headRepositoryOwner: { login: 'acme' } }

describe('the line under the prompt', () => {
  test('keeps the engine line and draws the usage row, on every surface', async ($, on) => {
    const { clock } = setUp(on)
    await $.session.start(START)
    await clock.settle()
    for (const surface of ['terminal', 'desktop'] as const) {
      expect(await rows($, { surface })).toEqual([HEAD_ROW, CONTEXT, METERS_ROW])
    }
  })

  test('before the session starts only the engine line is drawn', async ($, on) => {
    setUp(on)
    expect(await rows($)).toEqual([])
  })

  test('a non-interactive session draws nothing and runs nothing', async ($, on) => {
    const { clock, runs } = setUp(on, { repo: { status: FEATURE_STATUS } })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: false })
    await clock.settle()
    expect(await rows($)).toEqual([])
    expect(runs).toHaveLength(0)
  })

  test('effort is guessed from settings, then read from the main thread only', async ($, on) => {
    const { clock } = setUp(on, { settings: { effortLevel: 'medium' } })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($))[0]).toBe('✻ Opus 5.5  ●●○○○ medium')

    await step($, { effort: 'max' })
    await clock.settle()
    expect((await rows($))[0]).toBe('✻ Opus 5.5  ●●●●● max')

    await step($, { effort: 'low', agentId: 'sub-1' })
    await clock.settle()
    expect((await rows($))[0]).toBe('✻ Opus 5.5  ●●●●● max')
  })

  test('the line /effort leaves shows before the next request', async ($, on) => {
    const { clock } = setUp(on)
    await $.session.start(START)
    await clock.settle()
    await $.session.append({
      message: {
        type: 'user',
        content: [{ type: 'text', text: '<local-command-stdout>Set effort level to high (this session only)</local-command-stdout>' }],
      },
      door: 'command',
      origin: { kind: 'composer' },
      uuid: 'row-effort',
    })
    await clock.settle()
    expect((await rows($))[0]).toBe('✻ Opus 5.5  ●●●○○ high')
  })

  test('a new measurement moves the bars', async ($, on) => {
    const { world, clock } = setUp(on)
    await $.session.start(START)
    await clock.settle()
    world.usage = usageOf(184_000)
    await $.session.measure({ context: world.usage.context, rateLimits: world.usage.rateLimits, changed: ['context'] })
    await clock.settle()
    expect((await rows($))[1]).toBe('ctx ━━━━━━━━━─ 92% !  184k/200k')
  })

  test('the countdown moves as minutes pass', async ($, on) => {
    const { clock } = setUp(on)
    await $.session.start(START)
    await clock.settle()
    await clock.advance(60 * 60_000)
    expect((await rows($))[2]).toContain('↻1h13m')
  })

  test('after /clear empties the session state the row comes back by itself', async ($, on) => {
    const { clock } = setUp(on)
    // /clear wipes $.state without starting the session again: values read back empty until rewritten.
    const session = { isWiped: false }
    on('state.get', { plugin: 'status-line' }, async (_, e, next) => {
      const held = await next(e)
      return session.isWiped && held.value !== undefined ? { value: { ...held.value, value: undefined } } : held
    })
    on('state.set', { plugin: 'status-line' }, (_, e, next) => {
      session.isWiped = false
      return next(e)
    })
    await $.session.start(START)
    await clock.settle()
    session.isWiped = true
    expect(await rows($)).toEqual([])
    await clock.settle()
    expect(await rows($)).toEqual([HEAD_ROW, CONTEXT, METERS_ROW])
  })

  test('the rows give way as the width narrows, and never overflow', async ($, on) => {
    const { clock } = setUp(on)
    await $.session.start(START)
    await clock.settle()
    // The context meter is on its own row, drawn as wide as the width allows.
    expect(await rows($, { columns: 70 })).toEqual([MODEL, CONTEXT, LIMITS])
    expect(await rows($, { columns: 40 })).toEqual([MODEL, CONTEXT, '5h ━━──── 28% · 7d ━━━─── 42%'])
    // The limits keep one row on shorter bars, and take a row each only when two do not fit on one.
    expect(await rows($, { columns: 26 })).toEqual([MODEL, 'ctx ━───── 23%  46k/200k', '5h ━─── 28% · 7d ━━── 42%'])
    expect(await rows($, { columns: 20 })).toEqual([MODEL, 'ctx ━───── 23%', '5h ━━──── 28%', '7d ━━━─── 42%'])
    for (const columns of [70, 50, 40, 30, 24, 20]) {
      for (const row of await rows($, { columns })) expect(textWidth(row)).toBeLessThanOrEqual(columns)
    }
  })

  test('the git part sits beside the model only while it fits whole; else it has a row below', async ($, on) => {
    const { clock } = setUp(on, { repo: { status: `# branch.oid ${OID}\n# branch.head feature/bar\n` }, prs: [openPr] })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($, { columns: 120 }))[0]).toBe(`${MODEL} │ ~/dev/acme-web · feature/bar · PR #12`)
    // Too narrow for the whole of it beside the model: a row of its own, cut as before.
    expect((await rows($, { columns: 50 })).slice(0, 2)).toEqual([MODEL, '~/dev/acme-web · feature/bar · PR #12'])
    // Narrower, the pull request goes before the path is cut.
    expect((await rows($, { columns: 30 })).slice(0, 2)).toEqual([MODEL, '~/dev/acme-web · feature/bar'])
  })

  test('a phone gets the same rows, narrow, in a face of one width', async ($, on) => {
    const { clock } = setUp(on, { repo: { status: `# branch.oid ${OID}\n# branch.head feature/a-long-branch-name\n` } })
    await $.session.start(START)
    await clock.settle()
    for (const surface of ['mobile', 'vscode'] as const) {
      const drawnRows = await rows($, { surface, columns: 36 })
      expect(drawnRows).toEqual([MODEL, '~/dev/acme-web · feature/a-long-bra…', CONTEXT, '5h ━━──── 28% · 7d ━━━─── 42%'])
      for (const row of drawnRows) expect(textWidth(row)).toBeLessThanOrEqual(36)
    }
    const tree = JSON.stringify(await drawn($, { surface: 'mobile', columns: 36 }))
    expect(tree).toContain('"mono":true')
  })
})

describe('the git row', () => {
  test('the full path with the home folder as ~, then the branch, on every surface', async ($, on) => {
    const { clock, runs } = setUp(on, { repo: { status: FEATURE_STATUS } })
    await $.session.start(START)
    await clock.settle()
    for (const surface of ['terminal', 'desktop'] as const) {
      expect(await rows($, { surface })).toEqual([`${MODEL} │ ~/dev/acme-web · feature/bar`, CONTEXT, METERS_ROW])
    }
    const gits = runs.filter(run => run.argv[0] === 'git')
    expect(gits.length).toBeGreaterThan(0)
    expect(gits.every(run => run.argv[1] === '--no-optional-locks')).toBe(true)
  })

  test('a linked worktree in the middle of a rebase on a detached HEAD', async ($, on) => {
    const { clock } = setUp(on, {
      repo: {
        status: `# branch.oid ${OID}\n# branch.head (detached)\n`,
        paths: `${ROOT}/.git/worktrees/fix\n${ROOT}/.claude/worktrees/fix\n`,
        markers: ['rebase-merge'],
      },
    })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($))[0]).toBe(`${MODEL} │ ~/dev/acme-web/.claude/worktrees/fix · (1234567) (REBASING)`)
  })

  test('a branch switched in another terminal shows on the next poll; one switched by a tool at once', async ($, on) => {
    const { world, clock } = setUp(on, { repo: { status: `# branch.oid ${OID}\n# branch.head main\n` } })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($))[0]).toBe(`${MODEL} │ ~/dev/acme-web · main`)

    world.repo = { status: `# branch.oid ${OID}\n# branch.head fix/a\n` }
    await clock.advance(30_000)
    expect((await rows($))[0]).toBe(`${MODEL} │ ~/dev/acme-web · fix/a`)

    world.repo = { status: `# branch.oid ${OID}\n# branch.head fix/b\n` }
    await $.tool.call({ tool: 'Bash', command: 'git switch -c fix/b' })
    await clock.settle()
    expect((await rows($))[0]).toBe(`${MODEL} │ ~/dev/acme-web · fix/b`)
  })
})

describe('the pull request', () => {
  const repo = { status: `# branch.oid ${OID}\n# branch.head feature/bar\n` }

  test('the branch pull request is shown, and pressing it opens the page', async ($, on) => {
    const fork = { ...openPr, number: 99, headRepositoryOwner: { login: 'someone-else' } }
    const { clock, runs } = setUp(on, { repo, prs: [fork, openPr] })
    await $.session.start(START)
    await clock.settle()
    for (const surface of ['terminal', 'desktop'] as const) {
      expect((await rows($, { surface }))[0]).toBe(`${MODEL} │ ~/dev/acme-web · feature/bar · PR #12`)
    }

    const ui = await $.ui.mount({
      plugin: 'status-line',
      surface: 'terminal',
      component: 'PromptHint',
      props: { isDraft: false, isWorking: false, hint: ENGINE_LINE },
      viewport: { columns: 164, rows: 40, isFullscreen: true },
    })
    await ui.press({ key: `open:${PR_URL}` })
    await ui.unmount()
    expect(runs.some(run => run.argv[0] === 'open' && run.argv[1] === PR_URL)).toBe(true)
  })

  test('a named account pins gh to that account token', { options: { githubAccount: 'speardragon' } }, async ($, on) => {
    const { clock, runs } = setUp(on, { repo, prs: [openPr] })
    await $.session.start(START)
    await clock.settle()
    expect(runs.some(run => run.argv.join(' ') === 'gh auth token --hostname github.com --user speardragon')).toBe(true)
    const list = runs.find(run => run.argv[0] === 'gh' && run.argv[1] === 'pr')
    expect(list?.env?.GH_TOKEN).toBe('token-of-the-account')
  })

  test('without a named account gh runs as it is', async ($, on) => {
    const { clock, runs } = setUp(on, { repo, prs: [openPr] })
    await $.session.start(START)
    await clock.settle()
    expect(runs.some(run => run.argv[1] === 'auth')).toBe(false)
    expect(runs.find(run => run.argv[0] === 'gh')?.env?.GH_TOKEN).toBeUndefined()
  })

  test('a failing gh leaves the git row alone and backs off', async ($, on) => {
    const { clock, runs } = setUp(on, { repo, isGhFailing: true })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($))[0]).toBe(`${MODEL} │ ~/dev/acme-web · feature/bar`)
    await clock.advance(60_000)
    expect(runs.filter(run => run.argv[0] === 'gh')).toHaveLength(1)
  })

  test('a push asks again at once; otherwise every three minutes', async ($, on) => {
    const { clock, runs } = setUp(on, { repo, prs: [openPr] })
    const asked = () => runs.filter(run => run.argv[0] === 'gh').length
    await $.session.start(START)
    await clock.settle()
    expect(asked()).toBe(1)
    await clock.advance(60_000)
    expect(asked()).toBe(1)
    await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/bar' })
    await clock.settle()
    expect(asked()).toBe(2)
    await clock.advance(3 * 60_000)
    expect(asked()).toBe(3)
  })
})

describe('the Fable limit', () => {
  const asked = (fetches: { url: string }[]) => fetches.filter(one => one.url === USAGE_URL).length

  test('on a Fable model its weekly limit is read with the session login and drawn, on every surface', async ($, on) => {
    const { clock, fetches } = setUp(on, { model: 'claude-fable-5-2' })
    await $.session.start(START)
    await clock.settle()
    for (const surface of ['terminal', 'desktop'] as const) {
      // It starts over with the weekly limit, so the countdown stays on the weekly meter alone.
      expect((await rows($, { surface }))[2]).toEndWith('7d ━━━━────── 42%  ↻3d · fable ━━━━━━──── 60%')
    }
    expect(fetches).toEqual([{ url: USAGE_URL, auth: 'auth_test', beta: 'oauth-2025-04-20' }])
  })

  test('it is asked at most once in five minutes', async ($, on) => {
    const { world, clock, fetches } = setUp(on, { model: 'claude-fable-5-2' })
    await $.session.start(START)
    await clock.settle()
    await clock.advance(4 * 60_000)
    expect(asked(fetches)).toBe(1)
    world.answers = [{ status: 200, text: usageBody(75) }]
    await clock.advance(60_000)
    expect(asked(fetches)).toBe(2)
    expect((await rows($))[2]).toContain('fable ━━━━━━━━── 75%')
  })

  test('another model asks nothing and draws no Fable meter', async ($, on) => {
    const { clock, fetches } = setUp(on)
    await $.session.start(START)
    await clock.advance(10 * 60_000)
    expect(fetches).toHaveLength(0)
    expect((await rows($)).join(' ')).not.toContain('fable')
  })

  test('a plan with no Fable limit, an expired login and an API key all draw no meter', async ($, on) => {
    const { world, clock, fetches } = setUp(on, { model: 'claude-fable-5-2', answers: [{ status: 200, text: usageBody() }] })
    await $.session.start(START)
    await clock.settle()
    expect((await rows($)).join(' ')).not.toContain('fable ━')

    world.answers = [{ status: 401, text: '{}' }]
    await clock.advance(5 * 60_000)
    expect(asked(fetches)).toBe(2)
    expect((await rows($)).join(' ')).not.toContain('fable ━')
    // A refusal waits five minutes before the next try.
    await clock.advance(4 * 60_000)
    expect(asked(fetches)).toBe(2)
  })

  test('a session on an API key never calls the endpoint', async ($, on) => {
    const { clock, fetches } = setUp(on, { model: 'claude-fable-5-2', auth: { handle: 'key', kind: 'api-key' } })
    await $.session.start(START)
    await clock.advance(10 * 60_000)
    expect(fetches).toHaveLength(0)
  })
})

describe('parts', () => {
  test('the status header gives the branch, or the commit of a detached HEAD', async () => {
    expect(parseStatus(FEATURE_STATUS)).toEqual({ branch: 'feature/bar', upstream: { ahead: 2, behind: 1 } })
    expect(parseStatus(`# branch.oid ${OID}\n# branch.head (detached)\n`)).toEqual({ commit: '1234567' })
  })

  test('a path under the home folder starts with ~', async () => {
    expect(tildePath('/Users/ray/dev/acme-web', '/Users/ray')).toBe('~/dev/acme-web')
    expect(tildePath('/Users/ray', '/Users/ray/')).toBe('~')
    expect(tildePath('/Users/rayna/dev', '/Users/ray')).toBe('/Users/rayna/dev')
    expect(tildePath('/srv/app/', undefined)).toBe('/srv/app')
  })

  test('the Fable row of the usage answer is read, and nothing is made up without one', async () => {
    expect(fableOf(JSON.parse(usageBody(60)), NOW)).toEqual({ fetchedAt: NOW, window: { percentUsed: 60, resetsAt: WEEK_RESET } })
    expect(fableOf(JSON.parse(usageBody()), NOW)).toEqual({ fetchedAt: NOW })
    expect(fableOf({ unexpected: true }, NOW)).toEqual({ fetchedAt: NOW })
    expect(fableOf('not json', NOW)).toEqual({ fetchedAt: NOW })
  })

  test('the owner is read from every remote form', async () => {
    expect(remoteOwner('https://github.com/acme/acme-web.git')).toBe('acme')
    expect(remoteOwner('git@github.com:acme/acme-web.git')).toBe('acme')
    expect(remoteOwner('ssh://git@github.com/acme/acme-web')).toBe('acme')
    expect(remoteOwner(null)).toBeUndefined()
  })

  test('a pull request row becomes a state, and the state a color', async () => {
    const row = { ...openPr, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED' }
    const passed = { ...row, statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }] }
    expect(pullRequestOf(passed)).toEqual({ number: 12, url: PR_URL, state: 'open', merge: 'clean', checks: 'pass', review: 'approved' })
    expect(pullRequestColor(pullRequestOf(passed)!)).toBe(T.status.good)
    expect(pullRequestColor(pullRequestOf({ ...passed, statusCheckRollup: [{ status: 'IN_PROGRESS' }] })!)).toBe(T.status.serious)
    expect(pullRequestColor(pullRequestOf({ ...passed, statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })!)).toBe(T.status.critical)
    expect(pullRequestColor(pullRequestOf({ ...openPr, mergeable: 'CONFLICTING' })!)).toBe(T.status.critical)
    expect(pullRequestColor(pullRequestOf({ ...openPr, isDraft: true })!)).toBe(T.muted)
    expect(pullRequestColor(pullRequestOf({ ...openPr, state: 'MERGED' })!)).toBe(T.merged)
    expect(pullRequestOf({ state: 'OPEN' })).toBeUndefined()
  })

  test('a long branch is cut first, then the path from its start, then the pull request is dropped', async () => {
    const git: Git = { path: '~/dev/acme/acme-web', branch: 'feature/a-very-long-branch-name-that-goes-on' }
    const pr = { number: 12, url: PR_URL, state: 'open' } as const
    const texts = (columns: number) => gitRows(git, pr, columns).map(rowText)
    expect(texts(60)).toEqual(['~/dev/acme/acme-web · feature/a-very-long-branch-n… · PR #12'])
    // The branch is down to its least; now the path gives way, its end kept.
    expect(texts(40)[0]).toMatch(/^….*acme-web · feature\/a-v… · PR #12$/)
    // Nothing more to cut: the pull request goes.
    expect(texts(26)[0]).toMatch(/^….*-web · feature\/a-v…$/)
    for (const columns of [60, 40, 26]) expect(textWidth(texts(columns)[0] ?? '')).toBeLessThanOrEqual(columns)
    expect(gitRows(null, undefined, 80)).toEqual([])
  })

  test('a session with no limits and no reading yet still draws', async () => {
    const usage: Usage = { model: 'claude-fable-5-2', context: { window: 1_000_000 }, minute: 0 }
    expect(statusRows({ usage, effort: { kind: 'none' }, fable: undefined, git: null, pr: undefined }, 120, NOW).map(rowText)).toEqual(['✻ Fable 5.2', 'ctx ────────── —  —/1M'])
  })

  test('formats', async () => {
    expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(prettyModel('claude-fable-5-2[1m]')).toBe('Fable 5.2')
    expect(prettyModel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
    expect(prettyModel('my-gateway-model')).toBe('my-gateway-model')
    expect([formatTokens(950), formatTokens(46_000), formatTokens(1_000_000), formatTokens(1_200_000)]).toEqual(['950', '46k', '1M', '1.2M'])
    expect(resetIn(FIVE_RESET, NOW, 'minutes')).toBe('2h13m')
    expect(resetIn(WEEK_RESET, NOW, 'hours')).toBe('3d')
    expect(resetIn('2026-11-10T12:20:00Z', NOW, 'minutes')).toBe('20m')
    expect(resetIn('2026-11-10T11:00:00Z', NOW, 'minutes')).toBe('now')
    expect(resetIn(undefined, NOW, 'minutes')).toBeUndefined()
    expect([statusOf(80), statusOf(50), statusOf(25), statusOf(10)]).toEqual(['good', 'warning', 'serious', 'critical'])
  })

  test('/effort and /model lines are recognised', async () => {
    expect(effortFrom('Set effort level to max')).toBe('max')
    expect(effortFrom("Effort 'max' exceeds the cap for this model; set to 'high' instead")).toBe('high')
    expect(effortFrom('Set effort level to turbo')).toBeUndefined()
    expect(isModelSwitch('Set model to `Sonnet 5.5` and saved as your default')).toBe(true)
  })

  test('Hangul counts two cells when a name is cut', async () => {
    expect(textWidth('기능/상태줄')).toBe(11)
    expect(truncate('기능/상태줄-추가', 8)).toBe('기능/상…')
    expect(textWidth(truncate('기능/상태줄-추가', 8))).toBeLessThanOrEqual(8)
  })
})
