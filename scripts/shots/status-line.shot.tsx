// A screenshot of status-line under the prompt (scripts/shots/render.mjs).
import { mock, test } from 'claude-code/testing'

type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] }

const NOW = Date.parse('2026-11-10T12:00:00Z')
const HOME = '/Users/ray'
const ROOT = `${HOME}/dev/acme-web`
const WEEK_RESET = '2026-11-15T12:00:00Z'
const WIDTH = 124
const RULE = '─'.repeat(WIDTH - 2)

// The renderer paints raw colors; the theme keys the mod uses are spelled out as the dark theme has them.
const THEME: Record<string, string> = {
  claude: '#d97757',
  inactive: '#8b949e',
  subtle: '#484f58',
  warning: '#d29922',
  success: '#3fb950',
  permission: '#79c0ff',
  autoAccept: '#af87ff',
  merged: '#a371f7',
  gray: '#8b949e',
  green: '#3fb950',
  yellow: '#d29922',
}

const STATUS = [
  '# branch.oid 1234567890abcdef1234567890abcdef12345678',
  '# branch.head feat/status-line',
  '# branch.upstream origin/feat/status-line',
  '# branch.ab +1 -0',
  '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
  '1 .M N... 100644 100644 100644 aaa bbb src/b.ts',
  '1 .M N... 100644 100644 100644 aaa bbb src/c.ts',
  '1 M. N... 100644 100644 100644 aaa bbb src/d.ts',
  '1 A. N... 100644 100644 100644 aaa bbb src/e.ts',
  '? notes.md',
  '',
].join('\n')

const PR = {
  number: 12,
  url: 'https://github.com/acme/acme-web/pull/12',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: 'APPROVED',
  statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
  headRepositoryOwner: { login: 'acme' },
}

const painted = (node: Node | string): Node | string => {
  if (typeof node === 'string') return node
  const color = typeof node.props?.color === 'string' ? (THEME[node.props.color] ?? node.props.color) : undefined
  return {
    ...node,
    ...(node.props ? { props: { ...node.props, ...(color ? { color } : {}) } } : {}),
    ...(node.children ? { children: node.children.map(painted) } : {}),
  }
}

test('status-line', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const ran = (exitCode: number, stdout: string) => ({
    value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.authorize', () => ({ value: { handle: 'auth', kind: 'bearer' } }))
  on('http.fetch', () => ({
    value: {
      status: 200,
      ok: true,
      headers: {},
      text: JSON.stringify({ limits: [{ kind: 'weekly_scoped', percent: 37, resets_at: WEEK_RESET, scope: { model: { display_name: 'Fable' } } }] }),
    },
  }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000, tokens: 715_000, percent: 71 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 13, resetsAt: '2026-11-10T15:35:00Z' },
        { kind: 'seven_day', percentUsed: 82, resetsAt: WEEK_RESET },
      ],
    },
  }))
  on('session.repo', () => ({ value: { root: ROOT, remote: 'git@github.com:acme/acme-web.git', internal: false, name: null } }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('ui.render', () => ({
    type: 'Text',
    props: { color: THEME.inactive },
    children: ['  ⏵⏵ accept edits on (shift+tab to cycle)'],
  }))
  on('process.run', (_, e) => {
    const [command, ...args] = e.argv
    if (command === 'gh') return ran(0, JSON.stringify([PR]))
    if (args.includes('status')) return ran(0, STATUS)
    return ran(0, `${ROOT}/.git\n${ROOT}\n`)
  })

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({
    plugin: 'status-line',
    component: 'PromptHint',
    surface: 'terminal',
    props: { isDraft: false, isWorking: false, hint: '' },
    viewport: { columns: WIDTH, rows: 40 },
  } as never)
  const drawn = painted((await ui.drawn()) as Node) as Node
  // The prompt box the hint line sits under, so the picture shows where the rows are.
  const rule = { type: 'Text', props: { color: THEME.subtle }, children: [RULE] }
  const tree = {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [rule, { type: 'Text', children: ['❯ '] }, rule, drawn],
  }
  throw new Error(`@@SHOT@@${JSON.stringify({ name: 'status-line', width: WIDTH, height: 7, title: 'claude — ~/acme-web', tree, clients: {} })}@@END@@`)
})
