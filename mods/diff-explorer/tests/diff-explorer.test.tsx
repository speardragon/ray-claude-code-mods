import { describe, expect, test } from 'claude-code/testing'

import { changedRange, diffLines, unified } from '../hooks/diff'
import { sliceSegs, textWidth, truncate, wrapSegs } from '../hooks/text'
import { spans } from '../hooks/controls'
import { thumbOf } from '../hooks/scrollbar'
import { buildTree, relative, treeRows } from '../hooks/tree'

const PANE = {
  plugin: 'diff-explorer',
  component: 'Pane',
  requestId: 'diff-explorer',
  props: {
    title: 'Changes',
    isFocused: false,
    bodyColumns: 110,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// A disk in memory, which the engine's own Edit stands in for below.
function disk(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial))
  return files
}

describe('diff', () => {
  test('finds the shortest edit between two texts', async () => {
    const ops = diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])
    expect(ops.map(op => `${op.kind}:${op.text}`)).toEqual(['eq:a', 'del:b', 'add:x', 'eq:c', 'eq:d', 'add:e'])
  })

  test('groups changes into hunks with three lines of context', async () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const after = before.replace('line 10', 'line ten')
    const diff = unified(before, after)
    expect(diff.adds).toBe(1)
    expect(diff.dels).toBe(1)
    const hunk = diff.rows[0]
    expect(hunk).toMatchObject({ kind: 'hunk', oldStart: 7, oldLines: 7, newStart: 7, newLines: 7, skipped: 6 })
  })

  test('marks the changed middle of a paired line', async () => {
    expect(changedRange('const a = 1', 'const a = 2')).toEqual({ a: [10, 11], b: [10, 11] })
  })

  test('a new file is all additions', async () => {
    const diff = unified('', 'one\ntwo\n')
    expect(diff.adds).toBe(2)
    expect(diff.rows[0]).toMatchObject({ kind: 'hunk', oldStart: 0, oldLines: 0, newStart: 1, newLines: 2 })
  })
})

describe('text', () => {
  test('Hangul takes two cells', async () => {
    expect(textWidth('한글 ok')).toBe(7)
    expect(truncate('안녕하세요', 5)).toBe('안녕…')
  })

  test('a sideways window keeps columns where a wide character is cut', async () => {
    const cut = sliceSegs([{ text: 'ab한글cd', isMarked: false }], 3, 4)
    expect(cut.map(seg => seg.text).join('')).toBe(' 글c')
  })

  test('wraps by cells, not characters', async () => {
    const rows = wrapSegs([{ text: '가나다라', isMarked: false }], 5)
    expect(rows.map(r => r.map(s => s.text).join(''))).toEqual(['가나', '다라'])
  })
})

describe('tree', () => {
  test('compacts lone folders and lists folders first', async () => {
    const root = buildTree(
      ['src/hooks/a.ts', 'src/hooks/b.ts', 'README.md'].map(rel => ({ rel, path: `/repo/${rel}` })),
    )
    const rows = treeRows(root, new Set())
    expect(rows.map(r => `${r.kind}:${r.name}:${r.depth}`)).toEqual([
      'dir:src/hooks:0',
      'file:a.ts:1',
      'file:b.ts:1',
      'file:README.md:0',
    ])
  })

  test('shows paths under home with ~', async () => {
    expect(relative('/Users/me/notes/a.md', '/Users/me/repo', '/Users/me')).toBe('~/notes/a.md')
    expect(relative('/Users/me/repo/src/a.ts', '/Users/me/repo', '/Users/me')).toBe('src/a.ts')
  })
})

test('an edit shows up in the tree and its diff in the preview, on every surface', async ($, on) => {
  const files = disk({ '/repo/src/app.ts': 'const greeting = "hello"\nexport default greeting\n' })
  on('command.register', () => ({ value: { command: 'diffs' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Edit') {
      const input = e as unknown as { file_path: string; old_string: string; new_string: string }
      files.set(input.file_path, files.get(input.file_path)!.replace(input.old_string, input.new_string))
    }
    if (e.tool === 'Write') {
      const input = e as unknown as { file_path: string; content: string }
      files.set(input.file_path, input.content)
    }
    return { result: {} }
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const edit = { tool: 'Edit', file_path: '/repo/src/app.ts', old_string: '"hello"', new_string: '"안녕"' } as const
  const write = { tool: 'Write', file_path: '/repo/README.md', content: '# Hi\n' } as const
  // Typed loosely: the full tool-result union is too deep for tsc to instantiate here.
  const call = $.tool.call as unknown as (e: typeof edit | typeof write) => Promise<unknown>
  await call(edit)
  await call(write)

  // The latest change is selected: README.md, a new file.
  const first = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await first.find({ type: 'Text', text: 'NEW', in: 'file-head' })).toBeDefined()
  await first.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /app\.ts/, in: 'explorer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /README\.md/, in: 'explorer' })).toBeDefined()

    // The explorer is a Client: rows are src/ (0), app.ts (1), README.md (2). Hover, then click app.ts.
    await ui.pointer({ type: 'move', x: 4, y: 1, in: 'explorer' })
    const hovered = await ui.find({ type: 'Text', text: /app\.ts/, in: 'explorer' })
    // A quiet hover background, never the inverted Button; the selected row keeps its own.
    expect(hovered?.props.backgroundColor).toBe(surface === 'terminal' ? '#161b22' : '#21262d')
    await ui.pointer({ type: 'down', x: 4, y: 1, button: 'left', in: 'explorer' })
    await ui.pointer({ type: 'up', x: 4, y: 1, button: 'left', in: 'explorer' })
    expect(await ui.find({ type: 'Text', text: '안녕' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hello' })).toBeDefined()
    await ui.unmount()
  }
})

test('every hotkey is a control too, and collapse all folds the tree', async ($, on) => {
  const files = new Map([['/repo/src/a.ts', 'one\n']])
  on('command.register', () => ({ value: { command: 'diffs' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    const input = e as unknown as { file_path: string; content: string }
    files.set(input.file_path, input.content)
    return { result: {} }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const write = { tool: 'Write', file_path: '/repo/src/a.ts', content: 'two\n' } as const
  const call = $.tool.call as unknown as (e: typeof write) => Promise<unknown>
  await call(write)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // The chrome rows are surface modules, so their controls hover quietly instead of inverting.
  const rows = (await ui.findAll({ type: 'Client' })).map(c => c.key)
  expect(rows).toEqual(expect.arrayContaining(['toolbar', 'explorer-head', 'file-head', 'status', 'explorer', 'vbar', 'tbar']))
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)

  // The toolbar's Explorer control starts at column 1: hovering it lights its background.
  await ui.pointer({ type: 'move', x: 3, y: 0, in: 'toolbar' })
  expect((await ui.findAll({ type: 'Text', text: /Explorer/, in: 'toolbar' })).at(-1)?.props.backgroundColor).toBe('#262c36')
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'toolbar' })
  expect((await ui.findAll({ type: 'Text', text: /Explorer/, in: 'toolbar' })).at(-1)?.props.backgroundColor).toBe('#161b22')

  expect(await ui.find({ type: 'Text', text: /a\.ts/, in: 'explorer' })).toBeDefined()
  await ui.post({ action: 'collapseAll' }, { in: 'explorer-head' })
  expect(await ui.find({ type: 'Text', text: /a\.ts/, in: 'explorer' })).toBeUndefined()
  await ui.post({ action: 'collapseAll' }, { in: 'explorer-head' })
  expect(await ui.find({ type: 'Text', text: /a\.ts/, in: 'explorer' })).toBeDefined()

  // A click on the Explorer control hides the tree; a key passed on by any row shows it again.
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'toolbar' })
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'toolbar' })
  expect(await ui.find({ type: 'Client', key: 'explorer' })).toBeUndefined()
  await ui.key({ key: 't', in: 'status' })
  expect(await ui.find({ type: 'Client', key: 'explorer' })).toBeDefined()
  await ui.post({ action: 'tree' }, { in: 'toolbar' })
  expect(await ui.find({ type: 'Client', key: 'explorer' })).toBeUndefined()
  await ui.post({ action: 'tree' }, { in: 'toolbar' })
  expect(await ui.find({ type: 'Client', key: 'explorer' })).toBeDefined()
  await ui.unmount()
})

test('controls sit in a row, spacers taking the room left over', async () => {
  const items = [{ parts: [{ text: 'ab' }] }, { spacer: true as const }, { parts: [{ text: '한' }], action: 'x' }]
  expect(spans(items, 10)).toEqual([[0, 2], [2, 8], [8, 10]])
})

test('the thumb is as long as the window is to the content, placed by the offset', async () => {
  expect(thumbOf({ length: 10, total: 100, view: 10, offset: 0 })).toEqual({ start: 0, size: 1, max: 90 })
  expect(thumbOf({ length: 10, total: 100, view: 10, offset: 90 })).toEqual({ start: 9, size: 1, max: 90 })
  expect(thumbOf({ length: 10, total: 20, view: 10, offset: 5 })).toEqual({ start: 3, size: 5, max: 10 })
  expect(thumbOf({ length: 10, total: 5, view: 10, offset: 0 }).max).toBe(0)
})

test('with wrap off, long lines scroll sideways by the bar and by h/l', async ($, on) => {
  const long = 'x'.repeat(40) + 'TAIL'.repeat(30)
  const files = new Map([['/repo/a.ts', 'short\n']])
  on('command.register', () => ({ value: { command: 'diffs' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    const input = e as unknown as { file_path: string; content: string }
    files.set(input.file_path, input.content)
    return { result: {} }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const write = { tool: 'Write', file_path: '/repo/a.ts', content: `${long}\n` } as const
  const call = $.tool.call as unknown as (e: typeof write) => Promise<unknown>
  await call(write)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Client', key: 'vbar' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'hbar' })).toBeUndefined() // wrapped: nothing to scroll sideways

  await ui.post({ action: 'wrap' }, { in: 'status' })
  expect(await ui.find({ type: 'Client', key: 'hbar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /col 1–/, in: 'status' })).toBeDefined()

  await ui.post({ action: 'right' }, { in: 'status' })
  expect(await ui.find({ type: 'Text', text: /col 1–/, in: 'status' })).toBeUndefined()
  await ui.post({ action: 'left' }, { in: 'status' })
  expect(await ui.find({ type: 'Text', text: /col 1–/, in: 'status' })).toBeDefined()

  // Drag the bar's thumb to the far end.
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'hbar' })
  await ui.pointer({ type: 'move', x: 200, y: 0, button: 'left', in: 'hbar' })
  await ui.pointer({ type: 'up', x: 200, y: 0, button: 'left', in: 'hbar' })
  expect(await ui.find({ type: 'Text', text: /\/160\b/, in: 'status' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /–160\/160/, in: 'status' })).toBeDefined()
  await ui.unmount()
})

test('/diffs toggles the pane; on and off say which', async ($, on) => {
  let open = false
  const calls: string[] = []
  on('command.register', () => ({ value: { command: 'diffs' } }))
  on('env.get', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: open ? [{ id: 'diff-explorer', title: '', isShown: true, isFocused: true, isPlaced: true }] : [] }))
  on('ui.open', () => {
    open = true
    calls.push('open')
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    open = false
    calls.push('close')
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({ command: 'diffs', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  await run('')
  await run('')
  await run('on')
  await run('off')
  expect(calls).toEqual(['open', 'close', 'open', 'close'])
})
