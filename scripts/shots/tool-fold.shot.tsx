// A screenshot of tool-fold: a run of tool calls, one line each, one of them unfolded (scripts/shots/render.mjs).
import { test as kitTest } from 'claude-code/testing'

// One shot per run (scripts/shots/render.mjs sets the index): only the test at that index is declared.
const ONLY = (globalThis as Record<string, unknown>).__SHOT_INDEX__ as number | undefined
let declared = 0
const test: typeof kitTest = ((name: string, ...rest: unknown[]) => {
  if (ONLY === undefined || declared++ === ONLY) (kitTest as unknown as (...a: unknown[]) => void)(name, ...rest)
}) as typeof kitTest

type Node = { type?: string; props?: { key?: string }; children?: unknown[] }

const CALLS: [string, string, Record<string, unknown>, unknown, Partial<Record<'isRunning' | 'isErrored', boolean>>][] = [
  ['t1', 'Read', { file_path: '/repo/src/components/Sidebar.tsx' }, { type: 'text', file: { numLines: 42, totalLines: 42, content: '' } }, {}],
  ['t2', 'Grep', { pattern: 'useMediaQuery', path: '/repo/src' }, { numFiles: 3 }, {}],
  ['t3', 'Edit', { file_path: '/repo/src/components/Sidebar.tsx' }, { structuredPatch: [{ lines: ['+a', '+b', '+c', '+d', '+e', '+f', '+g', '+h', '-x', '-y'] }] }, {}],
  ['t4', 'Write', { file_path: '/repo/src/hooks/useFocusTrap.ts' }, { type: 'create', content: 'a\n'.repeat(38), structuredPatch: [] }, {}],
  ['t5', 'Bash', { command: 'npm test -- --run src/components' }, { stdout: ' PASS  src/components/Sidebar.test.tsx (3 tests) 412ms\n PASS  src/components/Nav.test.tsx (5 tests) 280ms\n\n Test Files  2 passed (2)\n      Tests  8 passed (8)\n', stderr: '' }, {}],
  ['t6', 'Bash', { command: 'npx tsc --noEmit' }, 'Error: src/app/page.tsx(12,5): Type string is not assignable to type number', { isErrored: true }],
  ['t7', 'WebFetch', { url: 'https://react.dev/reference/react/useSyncExternalStore' }, { code: 200, bytes: 48213 }, {}],
  ['t8', 'Bash', { command: 'npm run build' }, undefined, { isRunning: true }],
]

const RESULT_T5 = [
  '  ⎿   PASS  src/components/Sidebar.test.tsx (3 tests) 412ms',
  '       PASS  src/components/Nav.test.tsx (5 tests) 280ms',
  '',
  '       Test Files  2 passed (2)',
  '            Tests  8 passed (8)',
]

const WIDTH = 100

test('tool-fold', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // What the engine draws for an unfolded result: the tool's own result block.
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return <Box flexDirection="column">{RESULT_T5.map(line => <Text color="#8b949e">{line}</Text>)}</Box>
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const children: unknown[] = []
  const clients: Record<string, unknown> = {}
  const viewport = { columns: WIDTH + 2, rows: 40 }
  for (const [id, tool, input, output, flags] of CALLS) {
    const use = await $.ui.mount({
      plugin: 'tool-fold', component: 'ToolUse', requestId: id, surface: 'terminal', viewport,
      props: { tool_use_id: id, tool, input, output, isRunning: false, isErrored: false, isInterrupted: false, ...flags },
    } as never)
    if (id === 't5') await use.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: `row-${id}` })
    if (id === 't3') await use.pointer({ type: 'move', x: 2, y: 0, in: `row-${id}` })
    children.push(await use.drawn())
    clients[`row-${id}`] = await use.drawn({ in: `row-${id}` })
    if (output !== undefined) {
      const result = await $.ui.mount({
        plugin: 'tool-fold', component: 'ToolResult', requestId: id, surface: 'terminal', viewport,
        props: { tool_use_id: id, tool, output, isErrored: Boolean(flags.isErrored) },
      } as never)
      children.push(await result.drawn())
      await result.unmount()
    }
    await use.unmount()
  }
  const tree: Node = { type: 'Box', props: { flexDirection: 'column' }, children }
  const height = CALLS.length + RESULT_T5.length + 1
  throw new Error(`@@SHOT@@${JSON.stringify({ name: 'tool-fold', width: WIDTH, height, title: 'claude — ~/acme-web', tree, clients })}@@END@@`)
})

// ---- the panel ---------------------------------------------------------------------------------

const DOCS = JSON.stringify({
  documents: [
    { _id: { $oid: '6adedc58761ef473c665d0fb' }, name: '김하늘', email: 'sky@acme.io', age: 31, plan: 'pro', joined: { $date: '2024-03-01T09:00:00.000Z' }, tags: ['beta', 'admin'], addr: { city: 'Seoul', zip: '04524' }, active: true, credit: { $numberDecimal: '12.50' } },
    { _id: { $oid: '6adedc58761ef473c665d0fc' }, name: 'Lee Joon', email: 'joon@acme.io', age: 25, plan: 'free', joined: { $date: '2026-10-26T04:51:36.019Z' }, tags: [], addr: { city: 'Busan' }, active: false, credit: null },
  ],
  queryResultsCount: 128,
})

const PANEL_CALLS: [string, Record<string, unknown>, unknown, string, string?][] = [
  ['Read', { file_path: '/repo/src/components/Sidebar.tsx', offset: 1, limit: 12 }, { type: 'text', file: { filePath: '/repo/src/components/Sidebar.tsx', content: "import { useState } from 'react'\nimport { NavLink } from './NavLink'\nimport styles from './Sidebar.module.scss'\n\ntype Props = { items: { href: string; label: string }[] }\n\nexport function Sidebar({ items }: Props) {\n  const [active, setActive] = useState(items[0]?.href)\n  return (\n    <aside className={styles.sidebar}>\n      <nav>{items.map(i => <NavLink key={i.href} {...i} />)}</nav>\n    </aside>\n", startLine: 1, numLines: 12, totalLines: 42 } }, ''],
  ['Grep', { pattern: 'useMediaQuery', path: '/repo/src' }, { mode: 'content', numFiles: 2 }, '/repo/src/hooks/useMediaQuery.ts:3:export const useMediaQuery = (query: string) =>\n/repo/src/components/Sidebar.tsx:4:import { useMediaQuery } from \'../hooks/useMediaQuery\'\n/repo/src/components/Sidebar.tsx:11:  const isMobile = useMediaQuery(\'(max-width: 768px)\')'],
  ['Edit', { file_path: '/repo/src/components/Sidebar.tsx' }, { filePath: '/repo/src/components/Sidebar.tsx', structuredPatch: [{ oldStart: 1, newStart: 1, lines: ["-import { useState } from 'react'", "+import { useRef, useState } from 'react'", " import { NavLink } from './NavLink'", "+import { useFocusTrap } from '../hooks/useFocusTrap'", " import styles from './Sidebar.module.scss'"] }, { oldStart: 8, newStart: 9, lines: ['   const [active, setActive] = useState(items[0]?.href)', '+  const [isOpen, setOpen] = useState(false)', '+  const panel = useRef<HTMLElement>(null)', '   return ('] }] }, ''],
  ['Bash', { command: 'npm test -- --run src/components', description: 'Run the component tests' }, { stdout: ' ✓ src/components/Sidebar.test.tsx (3 tests) 412ms\n ✓ src/components/Nav.test.tsx (5 tests) 280ms\n\n Test Files  2 passed (2)\n      Tests  8 passed (8)\n   Duration  1.94s\n', stderr: '' }, ''],
  ['mcp__local-mongodb__list-collections', { connectionId: 'local', database: 'shop' }, undefined, JSON.stringify({ collections: [{ name: 'users' }, { name: 'orders' }, { name: 'sessions', type: 'view' }] })],
  ['mcp__local-mongodb__find', { connectionId: 'local', database: 'shop', collection: 'users', filter: { active: true, plan: { $in: ['pro', 'team'] } }, projection: { password: 0 }, sort: { joined: -1 }, limit: 20 }, undefined, DOCS],
  ['mcp__local-mongodb__aggregate', { connectionId: 'local', database: 'shop', collection: 'orders', pipeline: [{ $match: { paid: true } }, { $group: { _id: '$plan', revenue: { $sum: '$amount' } } }, { $sort: { revenue: -1 } }] }, undefined, JSON.stringify({ documents: [{ _id: 'pro', revenue: 18240 }, { _id: 'team', revenue: 9120 }] })],
  ['WebSearch', { query: 'useSyncExternalStore matchMedia SSR', mode: 'standard' }, { query: 'useSyncExternalStore matchMedia SSR', durationSeconds: 1.8, results: [{ tool_use_id: 'w', content: [{ title: 'useSyncExternalStore – React', url: 'https://react.dev/reference/react/useSyncExternalStore' }, { title: 'Subscribing to media queries without hydration mismatches', url: 'https://kentcdodds.com/blog/use-media-query' }, { title: 'matchMedia() - Web APIs | MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia' }] }, 'For SSR, pass a getServerSnapshot that returns a stable default (usually false) so the server and first client render agree.'] }, ''],
  ['AskUserQuestion', { questions: [{ question: 'Where should the drawer open from on mobile?', header: 'Drawer', multiSelect: false, options: [{ label: 'Left edge', description: 'Like the desktop sidebar; thumbs reach it less easily' }, { label: 'Bottom sheet', description: 'Easier to reach one-handed' }, { label: 'Full screen', description: 'Simplest, hides the page' }] }] }, { questions: [{ question: 'Where should the drawer open from on mobile?', header: 'Drawer', multiSelect: false, options: [{ label: 'Left edge', description: 'Like the desktop sidebar; thumbs reach it less easily' }, { label: 'Bottom sheet', description: 'Easier to reach one-handed' }, { label: 'Full screen', description: 'Simplest, hides the page' }] }], answers: { 'Where should the drawer open from on mobile?': 'Bottom sheet' } }, ''],
  ['TaskList', {}, { tasks: [{ id: '1', subject: 'Fold the sidebar into a drawer', status: 'completed' }, { id: '2', subject: 'Trap focus inside the drawer', status: 'completed' }, { id: '3', subject: 'Close on Esc and outside taps', status: 'in_progress', activeForm: 'Closing on Esc and outside taps', owner: 'claude' }, { id: '4', subject: 'Write the tests', status: 'pending', blockedBy: ['3'] }] }, ''],
  ['TodoWrite', { todos: [{ content: 'Fold the sidebar into a drawer', status: 'completed' }, { content: 'Trap focus inside the drawer', status: 'completed' }, { content: 'Close on Esc and outside taps', status: 'in_progress', activeForm: 'Closing on Esc and outside taps' }, { content: 'Write the tests', status: 'pending' }] }, undefined, ''],
]

for (const [name, pickTool] of [['tool-fold-panel-mongo', 'mcp__local-mongodb__find'], ['tool-fold-panel-bash', 'Bash'], ['tool-fold-panel-edit', 'Edit'], ['tool-fold-panel-web', 'WebSearch'], ['tool-fold-panel-ask', 'AskUserQuestion'], ['tool-fold-panel-tasks', 'TaskList']] as const) {
  test(name, async ($, on) => {
    on('command.register', () => ({ value: { command: 'tools' } }))
    on('env.get', () => ({ value: '/home/me' }))
    on('ui.panes', () => ({ value: [{ id: 'tool-fold', title: 'Tools', isShown: true, isFocused: true, isPlaced: true }] }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    const answers = new Map(PANEL_CALLS.map(([tool, , result, text]) => [tool, { result, text }]))
    on('tool.call', (_, e) => {
      const a = answers.get(e.tool)!
      return { result: a.result ?? [{ type: 'text', text: a.text }], text: a.text || undefined }
    })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    const call = $.tool.call as unknown as (e: Record<string, unknown>) => Promise<unknown>
    for (const [tool, input] of PANEL_CALLS) await call({ tool, ...input })
    const W = 132
    const H = 36
    const ui = await $.ui.mount({ plugin: 'tool-fold', component: 'Pane', requestId: 'tool-fold', surface: 'terminal', props: { title: 'Tools', isFocused: true, bodyColumns: W, placement: 'dock', scroll: { offset: 0, bodyRows: H }, view: {} } })
    const row = PANEL_CALLS.findIndex(([tool]) => tool === pickTool)
    await ui.pointer({ type: 'down', x: 4, y: row, button: 'left', in: 'list' })
    await ui.pointer({ type: 'up', x: 4, y: row, button: 'left', in: 'list' })
    const tree = (await ui.drawn()) as Node
    const keys: string[] = []
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return
      const node = n as Node
      if (node.type === 'Client' && node.props?.key) keys.push(node.props.key)
      node.children?.forEach(walk)
    }
    walk(tree)
    const clients: Record<string, unknown> = {}
    for (const key of keys) clients[key] = await ui.drawn({ in: key })
    throw new Error(`@@SHOT@@${JSON.stringify({ name, width: W, height: H, title: 'claude — ~/acme-web', tree, clients })}@@END@@`)
  })
}
