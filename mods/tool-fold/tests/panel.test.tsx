import type { TestBody } from 'claude-code/testing'
import { describe, expect, test } from 'claude-code/testing'

import { inline, parseText, tree } from '../hooks/views/json'
import { detailRows } from '../hooks/views'

const plain = (rows: { text: string }[][]) => rows.map(r => r.map(sp => sp.text).join(''))

const FIND_TEXT = JSON.stringify({
  documents: [
    { _id: { $oid: '6adedc58761ef473c665d0fb' }, name: 'Kim', age: 31, joined: { $date: '2024-03-01T09:00:00.000Z' }, tags: ['a', 'b'], addr: { city: 'Seoul' }, active: true, nothing: null },
    { _id: { $oid: '6adedc58761ef473c665d0fc' }, name: 'Lee', age: 25, active: false },
  ],
  queryResultsCount: 2,
})

const view = (tool: string, input: unknown, result: unknown, text?: string, state: 'running' | 'done' | 'error' = 'done') =>
  plain(detailRows({ tool, input, result, text, state, cwd: '/repo', home: '/home/me', width: 70 }))

describe('views', () => {
  test('EJSON reads as BSON types', async () => {
    expect(inline({ _id: { $oid: 'abc' }, n: { $numberLong: '9' } }).map(sp => sp.text).join('')).toBe("{ _id: ObjectId('abc'), n: Long('9') }")
    expect(plain(tree({ a: 1, b: { c: 'x' } }, 40))).toEqual(['a: 1', 'b: ▾ Object (1)', '  c: "x"'])
    expect(parseText('<untrusted-user-data-1>[{"a":1}]</untrusted-user-data-1>')).toEqual({ documents: [{ a: 1 }] })
  })

  test('a MongoDB find reads like Compass: namespace, query bar, document cards', async () => {
    const rows = view('mcp__local-mongodb__find', { connectionId: 'x', database: 'shop', collection: 'users', filter: { active: true }, limit: 10 }, undefined, FIND_TEXT)
    const all = rows.join('\n')
    expect(rows[0]).toMatch(/^local-mongodb › shop › users/)
    expect(rows[0]).toMatch(/read.*find/)
    expect(all).toContain('Filter   { active: true }')
    expect(all).toContain('Limit    10')
    expect(all).toContain('1 – 2 of 2')
    expect(all).toContain("_id: ObjectId('6adedc58761ef473c665d0fb')")
    expect(all).toContain('joined: 2024-03-01T09:00:00.000+00:00')
    expect(all).toContain('╭')
  })

  test('a MongoDB aggregate shows its pipeline as stages; an update shows its counts', async () => {
    const agg = view('mcp__mongodb__aggregate', { database: 'shop', collection: 'orders', pipeline: [{ $match: { paid: true } }, { $out: 'paid' }] }, undefined, '{"documents":[]}').join('\n')
    expect(agg).toContain('PIPELINE  2 stages')
    expect(agg).toMatch(/2 {2}\$out {2}writes/)
    const upd = view('mcp__mongodb__update-many', { database: 'shop', collection: 'users', filter: {}, update: { $set: { a: 1 } } }, undefined, '{"matchedCount":3,"modifiedCount":2,"upsertedCount":0}').join('\n')
    expect(upd).toContain('Matched 3   Modified 2   Upserted 0')
  })

  test('Bash is a terminal window; Edit a diff; any other MCP tool its input and result', async () => {
    const bash = view('Bash', { command: 'npm test', description: 'Run the tests' }, { stdout: 'ok\n', stderr: '' }).join('\n')
    expect(bash).toContain('Run the tests')
    expect(bash).toContain('$ npm test')
    expect(bash).toContain('ok')
    const edit = view('Edit', { file_path: '/repo/src/a.ts' }, { structuredPatch: [{ oldStart: 1, newStart: 1, lines: ['-old', '+new'] }] }).join('\n')
    expect(edit).toContain('+1 −1')
    expect(edit).toMatch(/− old/)
    expect(edit).toMatch(/\+ new/)
    const mcp = view('mcp__claude_ai_Slack__slack_send_message', { channel: 'C1', text: 'hi' }, undefined, '{"ok":true}').join('\n')
    expect(mcp).toContain('Slack · MCP')
    expect(mcp).toContain('channel  C1')
    expect(mcp).toContain('ok: true')
  })
})

const PANE = {
  plugin: 'tool-fold',
  component: 'Pane',
  requestId: 'tool-fold',
  props: { title: 'Tools', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the panel records each call and shows the picked one in its view', async ($, on) => {
  let open = false
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.panes', () => ({ value: open ? [{ id: 'tool-fold', title: 'Tools', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.open', () => {
    open = true
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' ? { result: { stdout: 'ok\n', stderr: '', interrupted: false }, text: 'ok' } : { result: [{ type: 'text', text: FIND_TEXT }], text: FIND_TEXT },
  )
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const call = $.tool.call as unknown as (e: Record<string, unknown>) => Promise<unknown>
  await call({ tool: 'Bash', command: 'npm test' })
  await call({ tool: 'mcp__local-mongodb__find', database: 'shop', collection: 'users', filter: {} })
  await $.command.run({ command: 'tools', args: 'panel', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  expect(open).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /npm test/, in: 'list' })).toBeDefined()
  // Following the newest: the MongoDB find, as Compass.
  expect(await ui.find({ type: 'Text', text: /local-mongodb › shop › users/ })).toBeDefined()
  // Picking the Bash call shows its terminal.
  const rows = await ui.findAll({ type: 'Text', text: /Bash/, in: 'list' })
  expect(rows.length).toBeGreaterThan(0)
  await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'list' })
  await ui.pointer({ type: 'up', x: 4, y: 0, button: 'left', in: 'list' })
  expect(await ui.find({ type: 'Text', text: /\$ npm test/ })).toBeDefined()
  await ui.unmount()
})

describe('more views', () => {
  test('a question shows its options with the answer picked', async () => {
    const q = { question: 'Which layout?', header: 'Layout', multiSelect: false, options: [{ label: 'Tree', description: 'like VS Code' }, { label: 'List' }] }
    const rows = view('AskUserQuestion', { questions: [q] }, { questions: [q], answers: { 'Which layout?': 'Tree' } }).join('\n')
    expect(rows).toContain('Layout')
    expect(rows).toContain('◉ Tree')
    expect(rows).toContain('○ List')
  })

  test('a skill is a badge; a plan a document; tasks a board', async () => {
    expect(view('Skill', { skill: 'code-review', args: 'high' }, { success: true, commandName: 'code-review' }).join('\n')).toMatch(/✦ code-review[\s\S]*Skill loaded[\s\S]*high/)
    expect(view('ExitPlanMode', {}, { plan: '# Plan\n\n- [ ] step one\n- [x] step zero', isAgent: false }).join('\n')).toMatch(/◆ Plan[\s\S]*# Plan[\s\S]*☐ step one[\s\S]*☑ step zero/)
    const board = view('TaskList', {}, { tasks: [{ id: '1', subject: 'A', status: 'completed' }, { id: '2', subject: 'B', status: 'in_progress', activeForm: 'Doing B' }, { id: '3', subject: 'C', status: 'pending', blockedBy: ['2'] }] }).join('\n')
    expect(board).toContain('1/3')
    expect(board).toContain('◐ #2 Doing B')
    expect(board).toContain('blocked by 2')
  })

  test('a tool search lists what it loaded; a schedule reads as a clock card', async () => {
    const ts = view('ToolSearch', { query: 'slack send', max_results: 5 }, { matches: ['mcp__claude_ai_Slack__slack_send_message'], query: 'slack send', total_deferred_tools: 40 }).join('\n')
    expect(ts).toContain('1 of 40 deferred tools')
    expect(ts).toContain('slack_send_message  Slack')
    expect(view('CronCreate', { cron: '0 9 * * 1', prompt: 'weekly report', recurring: true }, { id: 'c1', humanSchedule: 'Every Monday at 9:00', recurring: true }).join('\n')).toMatch(/Every Monday at 9:00[\s\S]*recurring[\s\S]*weekly report/)
  })

  test('an MCP result in markdown reads as a document', async () => {
    const rows = view('mcp__notion__fetch', { id: 'p1' }, undefined, '# Title\n\n- one\n- two').join('\n')
    expect(rows).toContain('# Title')
    expect(rows).toContain('• one')
  })
})

// A 1×1 PNG, and a Read that returned it with no dimensions (the panel reads them from the header).
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

async function readImage($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], surface: 'terminal' | 'desktop', file: { path: string; mime: string }) {
  let open = false
  const runs: string[][] = []
  on('command.register', () => ({ value: { command: 'tools' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.panes', () => ({ value: open ? [{ id: 'tool-fold', title: 'Tools', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.open', () => {
    open = true
    return { value: { isPlaced: true } }
  })
  on('process.run', (_, e) => {
    runs.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode: 0, stdout: '/tmp/tool-fold/x.png', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { type: 'image', file: { base64: PNG_1X1, type: file.mime, originalSize: 70 } }, text: '' }))
  await $.session.start({ cwd: '/repo', surface, isInteractive: true })
  const call = $.tool.call as unknown as (e: Record<string, unknown>) => Promise<unknown>
  await call({ tool: 'Read', file_path: file.path })
  await $.command.run({ command: 'tools', args: 'panel', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  return { ui: await $.ui.mount({ ...PANE, surface }), runs }
}

describe('a Read of an image', () => {
  test('draws the PNG itself in the terminal, sized from its header', async ($, on) => {
    const { ui, runs } = await readImage($, on, 'terminal', { path: '/repo/shot.png', mime: 'image/png' })
    expect(runs).toEqual([])
    const img = await ui.find({ type: 'Image' })
    expect(img?.props.source).toEqual({ file: '/repo/shot.png', format: 'png' })
    expect(String(img?.props.alt)).toContain('shot.png · PNG · 1×1')
    await ui.unmount()
  })

  test('converts a JPEG to a PNG copy and draws that', async ($, on) => {
    const { ui, runs } = await readImage($, on, 'terminal', { path: '/repo/photo.jpg', mime: 'image/jpeg' })
    expect(runs.length).toBe(1)
    expect(runs[0]!.slice(-2)).toEqual(['/repo/photo.jpg', expect.any(String)])
    const img = await ui.find({ type: 'Image' })
    expect(img?.props.source).toEqual({ file: '/tmp/tool-fold/x.png', format: 'png' })
    await ui.unmount()
  })

  test('falls back to text where no Image element exists', async ($, on) => {
    const { ui } = await readImage($, on, 'desktop', { path: '/repo/shot.png', mime: 'image/png' })
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /terminal panel only/ })).toBeDefined()
    await ui.unmount()
  })
})
