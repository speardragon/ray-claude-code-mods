// diff-explorer: the files Claude changes this session, in a VS Code-style pane beside the chat.
//   Left, an explorer tree of the changed files with Material-style icons and git-style status;
//   right, the selected file's diff against how it was before Claude first touched it, in GitHub dark.
//   /diffs opens it; n/p walk the files, v swaps diff and file view, w wraps, t shows or hides the tree;
//   the wheel scrolls whichever column it is over, the arrow keys the preview.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Scroll, TreeMode, Tracked, View } from '../types'
import { unified } from './diff'
import type { Diff } from './diff'
import type { IconStyle } from './icons'
import { buildTree, fileOrder, relative, treeRows } from './tree'
import { contentWidth, diffRows, lineRoom } from './rows'
import type { VRow } from './rows'
import { HOTKEYS } from './chrome'
import type { Action } from './chrome'
import { dropCells, expandTabs, textWidth } from './text'
import { layout, Pane, TREE_MIN, treeMax } from './view'
import type { Entry, Handlers, Layout } from './view'

const PANE = 'diff-explorer'
const TITLE = 'Changes'
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const BEFORE_MAX = 1_000_000 // longer earlier texts are not kept: such a file shows no diff
const MAX_FILES = 200
const FOLLOW_AFTER_PICK_MS = 60_000 // a file the person picked holds the preview this long against new edits
const DOCK_COLUMNS = 96
const READ_TTL_MS = 5_000 // a file read for drawing is read again after this, or once Claude edits it

// Held by the host, so a hot reload keeps them.
const files = atom({ plugin: 'diff-explorer', key: 'files' } as const, [] as Tracked[])
const selected = atom({ plugin: 'diff-explorer', key: 'selected' } as const, null as string | null)
const view = atom({ plugin: 'diff-explorer', key: 'view' } as const, 'diff' as View)
const wrap = atom({ plugin: 'diff-explorer', key: 'wrap' } as const, true)
const tree = atom({ plugin: 'diff-explorer', key: 'tree' } as const, 'auto' as TreeMode)
const collapsed = atom({ plugin: 'diff-explorer', key: 'collapsed' } as const, [] as string[])
const scroll = atom({ plugin: 'diff-explorer', key: 'scroll' } as const, { tree: 0, preview: 0, x: 0 } as Scroll)
const cwd = atom({ plugin: 'diff-explorer', key: 'cwd' } as const, '')
const treeWidth = atom({ plugin: 'diff-explorer', key: 'treeWidth' } as const, null as number | null)

// The explorer width the person dragged to, kept across sessions.
const WIDTH_KEY = 'treeWidth'

// The module's own bookkeeping; a reload starts it over.
const session = { home: '', command: 'diffs', isFullscreen: undefined as boolean | undefined, hasAutoOpened: false, pickedAt: 0 }
// The last drawing's measures, for the scroll and the hotkeys to clamp against.
const drawn = { layout: null as Layout | null, treeRows: 0, previewRows: 0, maxX: 0, wideView: 0, order: [] as string[], dirs: [] as string[] }
// Each file as last read for drawing, so scrolling and pressing read nothing from disk.
const reads = new Map<string, { text: string | null; readAt: number }>()
// Diffs by file, reused while neither side changed.
const diffs = new Map<string, { before: string; after: string; diff: Diff }>()
const vrows = new Map<string, { diff: Diff; width: number; isWrapped: boolean; rows: VRow[] }>()

// Which window each scrollbar moves, by its Client's key.
const BARS: Record<string, 'tree' | 'preview' | 'x'> = { tbar: 'tree', vbar: 'preview', hbar: 'x' }

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

async function readText($: EngineInterface, path: string): Promise<string | null> {
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? text : null
}

async function currentText($: EngineInterface, t: Tracked): Promise<string | null> {
  const kept = reads.get(t.path)
  const now = Date.now()
  if (kept && kept.readAt >= t.at && now - kept.readAt < READ_TTL_MS) return kept.text
  const text = await readText($, t.path)
  reads.set(t.path, { text, readAt: now })
  return text
}

function diffOf(path: string, before: string, after: string): Diff {
  const kept = diffs.get(path)
  if (kept && kept.before === before && kept.after === after) return kept.diff
  const diff = unified(before, after)
  diffs.set(path, { before, after, diff })
  return diff
}

function rowsOf(path: string, diff: Diff, width: number, isWrapped: boolean): VRow[] {
  const kept = vrows.get(path)
  if (kept && kept.diff === diff && kept.width === width && kept.isWrapped === isWrapped) return kept.rows
  const rows = diffRows(diff, width, isWrapped)
  vrows.set(path, { diff, width, isWrapped, rows })
  return rows
}

// What the tree and the header say of each file, read from disk as it is now.
async function entriesOf($: EngineInterface, list: Tracked[], root: string) {
  return Promise.all(
    list.map(async t => {
      const after = await currentText($, t)
      const status = t.before === null ? 'A' : after === null ? 'D' : 'M'
      const diff = t.isTooBig ? null : diffOf(t.path, t.before ?? '', after ?? '')
      const entry: Entry = {
        path: t.path,
        rel: relative(t.path, root, session.home),
        name: base(t.path),
        status,
        adds: diff?.adds ?? 0,
        dels: diff?.dels ?? 0,
        isSame: diff !== null && !diff.isBinary && diff.rows.length === 0 && status === 'M',
        isTooBig: t.isTooBig,
      }
      return { entry, diff, after }
    }),
  )
}

async function openPane($: EngineInterface, focus: boolean) {
  return $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, ...(focus ? { focus: true as const } : {}) })
}

// A file Claude is about to change: keep how it was, the first time only.
async function track($: EngineInterface, path: string, before: string | null) {
  const isTooBig = before !== null && before.length > BEFORE_MAX
  const now = Date.now()
  await update($, files, list => {
    const known = list.find(t => t.path === path)
    if (known) return list.map(t => (t === known ? { ...t, at: now, edits: t.edits + 1 } : t))
    const fresh: Tracked = { path, before: isTooBig ? null : before, isTooBig, at: now, edits: 1 }
    return [...list, fresh].slice(-MAX_FILES)
  })
  if (now - session.pickedAt > FOLLOW_AFTER_PICK_MS) {
    await update($, selected, () => path)
    await update($, scroll, s => ({ ...s, preview: 0 }))
  }
}

async function maybeAutoOpen($: EngineInterface, isOn: boolean) {
  if (!isOn || session.hasAutoOpened) return
  session.hasAutoOpened = true
  const panes = await $.ui.panes().catch(() => [])
  if (panes.some(p => p.id === PANE)) return
  // Unasked, only where it would dock as a sidebar; elsewhere a toast says how to open it.
  if (session.isFullscreen === true) await openPane($, false).catch(() => undefined)
  else $.ui.toast(`diff-explorer: /${session.command} shows the files Claude changed`)
}

async function move($: EngineInterface, by: number) {
  const order = drawn.order
  if (order.length === 0) return
  session.pickedAt = Date.now()
  const now = await read($, selected)
  const at = now ? order.indexOf(now) : -1
  const next = order[clamp(at < 0 ? 0 : at + by, 0, order.length - 1)]!
  await update($, selected, () => next)
  await update($, scroll, s => ({ ...s, preview: 0, x: 0 }))
}

// The furthest each window can go, from the last drawing.
function maxOf(region: 'tree' | 'preview' | 'x') {
  const at = drawn.layout
  if (!at) return 0
  if (region === 'tree') return Math.max(0, drawn.treeRows - at.treeBody)
  if (region === 'preview') return Math.max(0, drawn.previewRows - at.previewBody)
  return drawn.maxX
}

async function scrollBy($: EngineInterface, region: 'tree' | 'preview' | 'x', by: number) {
  const max = maxOf(region)
  await update($, scroll, s => ({ ...s, [region]: clamp((s[region] ?? 0) + by, 0, max) }))
}

async function scrollTo($: EngineInterface, region: 'tree' | 'preview' | 'x', offset: number) {
  const max = maxOf(region)
  await update($, scroll, s => ({ ...s, [region]: clamp(offset, 0, max) }))
}

async function pickFile($: EngineInterface, path: string) {
  session.pickedAt = Date.now()
  await update($, selected, () => path)
  await update($, scroll, s => ({ ...s, preview: 0, x: 0 }))
}

const toggleDir = ($: EngineInterface, key: string) =>
  update($, collapsed, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))

// Collapse every folder while any is open; expand them all once none is.
const collapseAll = ($: EngineInterface) =>
  update($, collapsed, list => (drawn.dirs.some(d => !list.includes(d)) ? [...drawn.dirs] : []))

// What each control and its key does.
function actions($: EngineInterface): Record<Action, () => Promise<unknown>> {
  const page = () => Math.max(1, (drawn.layout?.previewBody ?? 10) - 2)
  const half = () => Math.max(4, Math.round(drawn.wideView / 2))
  return {
    collapseAll: () => collapseAll($).then(() => update($, scroll, s => ({ ...s, tree: 0 }))),
    next: () => move($, 1),
    prev: () => move($, -1),
    view: () => update($, view, v => (v === 'diff' ? 'file' : 'diff')).then(() => update($, scroll, s => ({ ...s, preview: 0, x: 0 }))),
    wrap: () => update($, wrap, w => !w).then(() => update($, scroll, s => ({ ...s, x: 0 }))),
    tree: () => update($, tree, () => (drawn.layout?.showTree ? 'hidden' : 'shown')),
    down: () => scrollBy($, 'preview', page()),
    up: () => scrollBy($, 'preview', -page()),
    left: () => scrollBy($, 'x', -half()),
    right: () => scrollBy($, 'x', half()),
  }
}

function handlers($: EngineInterface): Handlers {
  const run = actions($)
  const press = (action: Action) => () => void run[action]()
  return {
    pick: path => void pickFile($, path),
    toggle: key => void toggleDir($, key),
    collapseAll: press('collapseAll'),
    next: press('next'),
    prev: press('prev'),
    view: press('view'),
    wrap: press('wrap'),
    tree: press('tree'),
    down: press('down'),
    up: press('up'),
    left: press('left'),
    right: press('right'),
  }
}

const BY_KEY = new Map(Object.entries(HOTKEYS).map(([action, key]) => [key, action as Action]))

// A key a surface module passed on: the pane's letters anywhere; in the explorer the arrows walk
// the files, elsewhere they scroll the preview a row or a few columns at a time.
async function pressKey($: EngineInterface, element: string, key: string) {
  const action = BY_KEY.get(key.toLowerCase())
  if (action) return actions($)[action]()
  if (element === 'explorer' && (key === 'up' || key === 'down')) return move($, key === 'up' ? -1 : 1)
  if (key === 'up' || key === 'down') return scrollBy($, 'preview', key === 'up' ? -1 : 1)
  if (key === 'pageup') return actions($).up()
  if (key === 'pagedown') return actions($).down()
  if (key === 'left' || key === 'right') return scrollBy($, 'x', key === 'left' ? -4 : 4)
  if (key === '[' || key === ']') return resizeBy($, key === '[' ? -2 : 2)
  return undefined
}

// The explorer's width: a number the person chose (kept in the store once settled), or null for the default.
async function resizeTo($: EngineInterface, width: number | null, isDone: boolean) {
  const at = drawn.layout
  const next = width === null || !at ? width : Math.max(TREE_MIN, Math.min(treeMax(at.width), Math.round(width)))
  await update($, treeWidth, () => next)
  if (!isDone) return
  if (next === null) await $.store.delete(WIDTH_KEY).catch(() => undefined)
  else await $.store.set(WIDTH_KEY, next).catch(() => undefined)
}

const resizeBy = ($: EngineInterface, by: number) => resizeTo($, (drawn.layout?.treeWidth ?? 28) + by, true)

const isOpen = async ($: EngineInterface) => (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)

// /diffs toggles the pane; on and off say which; clear forgets what was tracked.
async function command($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (arg === 'clear') {
    await update($, files, () => [])
    await update($, selected, () => null)
    await update($, scroll, () => ({ tree: 0, preview: 0, x: 0 }))
    diffs.clear()
    vrows.clear()
    reads.clear()
    return { text: 'Cleared. Files Claude changes from now on show up again.' }
  }
  if (arg === 'off' || arg === 'close' || (arg === '' && (await isOpen($)))) {
    await $.ui.close({ id: PANE }).catch(() => undefined)
    return { text: `Closed. /${session.command} opens it again.` }
  }
  const opened = await openPane($, true)
  const count = (await read($, files)).length
  if (!opened.isPlaced) return { text: `The pane could not be shown (${opened.reason}).` }
  return { text: `${count} changed file${count === 1 ? '' : 's'}. n/p walk them, v swaps diff and file, w wraps, t toggles the tree.` }
}

export const register: Register = (on, options) => {
  const icons: IconStyle = options.icons === 'plain' ? 'plain' : 'nerd'
  const autoOpen = options.autoOpen !== false

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    session.home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    await update($, cwd, () => e.cwd)
    const kept = await $.store.get(WIDTH_KEY).catch(() => undefined)
    if (typeof kept === 'number') await update($, treeWidth, () => kept)
    // /diffs, or /diff-explorer if a built-in or another plugin ever takes /diffs.
    for (const name of ['diffs', 'diff-explorer']) {
      const ok = await $.command
        .register({ name, description: 'Show the files Claude changed, as a tree with their diffs', argumentHint: '[on | off | clear]' })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        session.command = name
        break
      }
    }
    return r
  })

  // Reads what Claude writes, the main agent's and every subagent's; never blocks or changes the call.
  on('tool.call', async ($, e, next) => {
    if (!EDIT_TOOLS.has(e.tool)) return next(e)
    const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
    const path = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
    if (typeof path !== 'string' || !path.startsWith('/')) return next(e)
    const before = await readText($, path) // before the write lands
    const r = await next(e)
    if (r.deny !== undefined || r.isError === true) return r
    await track($, path, before).catch(() => undefined)
    await maybeAutoOpen($, autoOpen).catch(() => undefined)
    return r
  })

  on('command.run', { command: 'diffs' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'diff-explorer' }, async ($, e) => command($, e.args))

  // Only to learn whether the terminal docks panes, so an unasked open lands as a sidebar.
  on('ui.render', { component: 'AbovePrompt' }, async (_$, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) session.isFullscreen = e.viewport.isFullscreen
    return next(e)
  })

  // What the pane's surface modules post: a click on an explorer row, or where a scrollbar's drag
  // or click wants its window to stand.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = (e.data ?? {}) as { press?: unknown; action?: unknown }
    if (typeof data.press === 'string') {
      await pressKey($, e.element, data.press)
      return {}
    }
    if (typeof data.action === 'string' && data.action in HOTKEYS) {
      await actions($)[data.action as Action]()
      return {}
    }
    if (e.element === 'sash') {
      const message = e.data as { width?: unknown; isDone?: unknown } | null
      if (typeof message?.width === 'number' || message?.width === null) await resizeTo($, message.width, message.isDone === true)
      return {}
    }
    if (e.element === 'explorer') {
      const message = e.data as { type?: unknown; key?: unknown } | null
      if (typeof message?.key !== 'string') return {}
      if (message.type === 'pick') await pickFile($, message.key)
      else if (message.type === 'toggle') await toggleDir($, message.key)
      return {}
    }
    const region = BARS[e.element]
    const message = e.data as { offset?: unknown } | null
    if (region !== undefined && typeof message?.offset === 'number') await scrollTo($, region, message.offset)
    return {}
  })

  // The wheel scrolls the column under it; the keys (no pointer) scroll the preview.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const at = drawn.layout
    const isTree = at !== null && at.showTree && e.pointer !== undefined && e.pointer.column < at.treeWidth
    await scrollBy($, isTree ? 'tree' : 'preview', e.by)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') session.isFullscreen ??= true
    const list = await read($, files)
    const root = (await read($, cwd)) || '/'
    const isWrapped = await read($, wrap)
    const mode = await read($, view)
    const at = layout(e.props.bodyColumns, e.props.scroll.bodyRows, await read($, tree), mode === 'file' || !isWrapped, await read($, treeWidth))
    const offsets = await read($, scroll)

    const known = await entriesOf($, list, root)
    const nodes = buildTree(known.map(k => ({ rel: k.entry.rel, path: k.entry.path })))
    const shut = new Set(await read($, collapsed))
    const rows = treeRows(nodes, shut)
    const dirs = treeRows(nodes, new Set()).flatMap(row => (row.kind === 'dir' ? [row.key] : []))
    const order = fileOrder(nodes)
    const want = await read($, selected)
    const pick = want && order.includes(want) ? want : (order[order.length - 1] ?? null)
    const chosen = known.find(k => k.entry.path === pick) ?? null

    let preview: VRow[] = []
    let code: { source: string; startLine: number } | null = null
    let wide = { total: 0, view: at.previewInner }
    if (chosen) {
      const { entry, diff, after } = chosen
      if (mode === 'file' && after !== null) {
        const lines = after.split('\n').map(line => expandTabs(line))
        const start = clamp(offsets.preview, 0, Math.max(0, lines.length - at.previewBody))
        // The engine's gutter is the last line number and some room: an estimate is enough for the bar.
        wide = { total: lines.reduce((n, l) => Math.max(n, textWidth(l)), 0), view: Math.max(1, at.previewInner - String(lines.length).length - 3) }
        const x = clamp(offsets.x ?? 0, 0, Math.max(0, wide.total - wide.view))
        const window = lines.slice(start, start + at.previewBody).map(line => dropCells(line, x))
        code = { source: window.join('\n'), startLine: start + 1 }
        drawn.previewRows = lines.length
      } else if (entry.isTooBig) {
        preview = [{ kind: 'note', text: '  Too large to diff (over 1 MB). v shows the file.', color: '#7d8590' }]
      } else if (diff?.isBinary) {
        preview = [{ kind: 'note', text: '  Binary file: no text diff.', color: '#7d8590' }]
      } else if (entry.isSame) {
        preview = [{ kind: 'note', text: '  No net changes: the file is back to how it was.', color: '#7d8590' }]
      } else if (diff) {
        preview = rowsOf(entry.path, diff, at.previewInner, isWrapped)
        wide = { total: contentWidth(preview), view: lineRoom(preview, at.previewInner) }
      }
      if (code === null) drawn.previewRows = preview.length
    } else {
      drawn.previewRows = 0
    }
    drawn.layout = at
    drawn.treeRows = rows.length
    drawn.order = order
    drawn.dirs = dirs
    drawn.maxX = at.hasHbar ? Math.max(0, wide.total - wide.view) : 0
    drawn.wideView = wide.view

    const clamped = {
      tree: clamp(offsets.tree, 0, Math.max(0, rows.length - at.treeBody)),
      preview: clamp(offsets.preview, 0, Math.max(0, drawn.previewRows - at.previewBody)),
      x: clamp(offsets.x ?? 0, 0, drawn.maxX),
    }
    return (
      <Pane
        m={{
          els,
          at,
          icons,
          entries: known.map(k => k.entry),
          tree: rows,
          canCollapse: dirs.some(d => !shut.has(d)),
          previewTotal: drawn.previewRows,
          wideTotal: wide.total,
          wideView: wide.view,
          selected: chosen?.entry ?? null,
          position: pick ? order.indexOf(pick) + 1 : 0,
          view: mode,
          isWrapped,
          rows: preview,
          code,
          scroll: clamped,
          on: handlers($),
        }}
      />
    )
  })
}
