// The panel mode's hooks: every tool call recorded as it starts and ends, the pane drawn from the
// record, and the pane's clicks, keys, wheel and scrollbars. `/tools panel` turns the pane on and off.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { CallRef } from './calls'
import { MAX_CALLS, begin, bodyOf, finish, forget, setImagePng } from './calls'
import { keyStep } from './keys'
import type { CallRow } from './list-client'
import { Panel, panelLayout } from './panel'
import type { PanelLayout } from './panel'
import { subject, toolName } from './summary'
import { textWidth, truncate } from './text'
import { detailRows, mongoOp } from './views'
import type { Line } from './views'
import type { Detail } from './views/image'
import { imageDetail } from './views/image'
import { P, duration } from './views/kit'

const PANE = 'tool-fold'
const TITLE = 'Tools'
const DOCK_COLUMNS = 120
const FOLLOW = -1 // the list's offset while it keeps the newest call in view

// The list is small and lives in $.state; inputs and results stay in ./calls.
const calls = atom({ plugin: 'tool-fold', key: 'calls' } as const, [] as CallRef[])
const picked = atom({ plugin: 'tool-fold', key: 'picked' } as const, null as string | null)
const follow = atom({ plugin: 'tool-fold', key: 'follow' } as const, true)
const pscroll = atom({ plugin: 'tool-fold', key: 'pscroll' } as const, { list: FOLLOW, detail: 0, detailFor: null as string | null })

const where = { cwd: '', home: '' }
const drawn = { at: null as PanelLayout | null, listTotal: 0, detailTotal: 0, order: [] as string[], shown: null as string | null }
const details = new Map<string, Detail>() // laid-out detail by call, size and state; oldest first

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function setPlace(cwd: string, home: string) {
  where.cwd = cwd
  where.home = home
}

function toolTone(tool: string) {
  if (mongoOp(tool, {})) return '#00ed64'
  if (tool === 'Bash') return '#7ee787'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return '#79c0ff'
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return '#ffa657'
  if (tool === 'Agent' || tool === 'Task') return '#d2a8ff'
  if (/^Web/.test(tool)) return '#a5d6ff'
  if (tool.startsWith('mcp__')) return '#8b949e'
  return P.fg
}

const GLYPH = { running: ['◐', P.warn], done: ['✓', P.ok], error: ['✗', P.err] } as const

export async function isPanelOpen($: EngineInterface) {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)
}

async function pick($: EngineInterface, id: string, byPerson = true) {
  await update($, picked, () => id)
  await update($, pscroll, s => ({ ...s, detail: 0, detailFor: id }))
  if (byPerson) await update($, follow, () => false)
}

// A click on a transcript line while the pane is up: the call shows in the pane.
export async function showInPanel($: EngineInterface, id: string) {
  if (!(await isPanelOpen($))) return false
  await pick($, id)
  return true
}

async function step($: EngineInterface, by: number) {
  const order = drawn.order
  if (order.length === 0) return
  const at = drawn.shown ? order.indexOf(drawn.shown) : order.length - 1
  const next = order[clamp(at + by, 0, order.length - 1)]!
  if (next === drawn.shown) return
  await pick($, next)
  // Keep it in the list's window.
  const layout = drawn.at
  if (!layout) return
  const row = order.indexOf(next)
  await update($, pscroll, s => {
    const max = Math.max(0, drawn.listTotal - layout.listRows)
    const top = s.list === FOLLOW ? max : s.list
    const nextTop = row < top ? row : row >= top + layout.listRows ? row - layout.listRows + 1 : top
    return { ...s, list: clamp(nextTop, 0, max) }
  })
}

async function scrollBy($: EngineInterface, region: 'list' | 'detail', by: number) {
  const layout = drawn.at
  if (!layout) return
  if (region === 'list') {
    const max = Math.max(0, drawn.listTotal - layout.listRows)
    await update($, pscroll, s => {
      const to = clamp((s.list === FOLLOW ? max : s.list) + by, 0, max)
      return { ...s, list: to === max ? FOLLOW : to }
    })
    return
  }
  const max = Math.max(0, drawn.detailTotal - layout.detailRows)
  const shown = drawn.shown
  await update($, pscroll, s => ({ ...s, detail: clamp((s.detailFor === shown ? s.detail : 0) + by, 0, max), detailFor: shown }))
}

export async function panelCommand($: EngineInterface, arg: string) {
  const isOpen = await isPanelOpen($)
  if (arg === 'off' || (arg === '' && isOpen)) {
    await $.ui.close({ id: PANE }).catch(() => undefined)
    return { text: 'Tool panel closed. /tools panel opens it again.' }
  }
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, focus: true })
  if (!opened.isPlaced) return { text: `The tool panel could not be shown (${opened.reason}).` }
  const n = (await read($, calls)).length
  return { text: `Tool panel: ${n} call${n === 1 ? '' : 's'} so far. ↑↓ pick one; a click on a folded line in the transcript shows it here.` }
}

function detailFor(ref: CallRef, width: number, height: number, canDraw: boolean): Detail {
  const body = bodyOf(ref.id)
  const img = body?.image
  const key = `${ref.id}|${width}|${height}|${canDraw}|${ref.state}|${ref.endedAt ?? 0}|${img?.png ?? img?.problem ?? ''}`
  const kept = details.get(key)
  if (kept) return kept
  const detail: Detail = img
    ? imageDetail(img, ref.state, width, height, canDraw)
    : {
        rows: body
          ? detailRows({ tool: ref.tool, input: body.input, result: body.result, text: body.text, state: ref.state, ms: ref.endedAt ? ref.endedAt - ref.startedAt : undefined, cwd: where.cwd, home: where.home, width })
          : [[{ text: 'This call ran before the panel was recording.', paint: { color: P.muted, italic: true } }]],
      }
  details.set(key, detail)
  if (details.size > 60) details.delete(details.keys().next().value!)
  return detail
}

// A PNG copy of an image the terminal cannot read as it is (JPEG, GIF, WebP), made by sips on macOS
// or ImageMagick elsewhere into a folder under the temp dir; null, with why, when neither works.
const CONVERT = [
  'd="${TMPDIR:-/tmp}/tool-fold"; mkdir -p "$d" || exit 3; out="$d/$2.png"; rm -f "$out"',
  'if command -v sips >/dev/null 2>&1; then sips -s format png "$1" --out "$out" >/dev/null 2>&1 || exit 4',
  'elif command -v magick >/dev/null 2>&1; then magick "$1[0]" "$out" || exit 4',
  'elif command -v convert >/dev/null 2>&1; then convert "$1[0]" "$out" || exit 4',
  'else exit 5; fi',
  '[ -s "$out" ] || exit 4', // sips exits 0 on a file it could not read
  'printf %s "$out"',
].join('\n')

async function pngCopy($: EngineInterface, path: string, id: string): Promise<{ png?: string; problem?: string }> {
  try {
    const r = await $.process.run(['/bin/sh', '-c', CONVERT, 'sh', path, id.replace(/[^A-Za-z0-9_-]/g, '')], { timeoutMs: 8000 })
    if (r.exitCode === 0 && r.stdout.trim()) return { png: r.stdout.trim() }
    return { problem: r.exitCode === 5 ? 'No converter (sips or ImageMagick) to make a PNG of this picture.' : 'The picture could not be converted to PNG.' }
  } catch {
    return { problem: 'The picture could not be converted to PNG.' }
  }
}

export function registerPanel(on: On) {
  // Every call, the main agent's and its subagents', recorded as it starts and as it ends. The
  // record never changes the call; a failure to record is passed over.
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    try {
      const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
      begin(id, input)
      const ref: CallRef = { id, tool: e.tool, state: 'running', startedAt: Date.now(), ...(e.agentId ? { agentId: e.agentId } : {}) }
      await update($, calls, list => [...list.filter(c => c.id !== id), ref].slice(-MAX_CALLS))
    } catch {
      // recording is best effort
    }
    const r = await next(e)
    try {
      const failed = r.isError === true || r.deny !== undefined
      finish(id, r.deny !== undefined ? r.deny : r.result, r.text ?? r.deny)
      const image = bodyOf(id)?.image
      if (image && !image.png) {
        const made = image.path ? await pngCopy($, image.path, id) : { problem: 'The Read named no file to draw.' }
        setImagePng(id, made.png, made.problem)
      }
      const state: CallRef['state'] = failed ? 'error' : 'done'
      await update($, calls, list => list.map(c => (c.id === id ? { ...c, state, endedAt: Date.now() } : c)))
    } catch {
      // recording is best effort
    }
    return r
  }).catch(($, e, next) => next(e))

  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = (e.data ?? {}) as { pick?: unknown; press?: unknown; action?: unknown; offset?: unknown }
    if (typeof data.pick === 'string') await pick($, data.pick)
    else if (data.action === 'follow') await update($, follow, f => !f)
    else if (data.action === 'clear') {
      await update($, calls, () => [])
      await update($, picked, () => null)
      forget()
      details.clear()
    } else if (typeof data.press === 'string') {
      const inList = e.element === 'list' || e.element === 'lbar'
      if (data.press === 'up' || data.press === 'down') await (inList ? step($, data.press === 'up' ? -1 : 1) : scrollBy($, 'detail', data.press === 'up' ? -1 : 1))
      else if (data.press === 'pageup' || data.press === 'pagedown') await scrollBy($, inList ? 'list' : 'detail', (data.press === 'pageup' ? -1 : 1) * 10)
    } else if (typeof data.offset === 'number') {
      const layout = drawn.at
      if (!layout) return {}
      const offset = data.offset
      if (e.element === 'lbar') await update($, pscroll, s => ({ ...s, list: clamp(offset, 0, Math.max(0, drawn.listTotal - layout.listRows)) }))
      if (e.element === 'dbar') await update($, pscroll, s => ({ ...s, detail: clamp(offset, 0, Math.max(0, drawn.detailTotal - layout.detailRows)), detailFor: drawn.shown }))
    }
    return {}
  })

  // The wheel scrolls the column under it; the pane's keys (no pointer) walk the list.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.origin.kind === 'person' && e.pointer === undefined) {
      const by = keyStep(e.by, e.bodyRows, e.contentRows, (drawn.at?.listRows ?? 10) - 2)
      if (by !== 0) await step($, by)
      return {}
    }
    const layout = drawn.at
    const overList = layout !== null && e.pointer !== undefined && (layout.isStacked ? e.pointer.row < layout.listRows + 2 : e.pointer.column < layout.listWidth)
    await scrollBy($, overList ? 'list' : 'detail', e.by)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const at = panelLayout(e.props.bodyColumns, e.props.scroll.bodyRows)
    const list = await read($, calls)
    const isFollowing = await read($, follow)
    const want = await read($, picked)
    const offsets = await read($, pscroll)

    // The list: newest last, a subagent's calls marked under it.
    const inner = at.listWidth - 1
    const now = Date.now()
    const rows: CallRow[] = list.map(c => {
      const [glyph, glyphColor] = GLYPH[c.state]
      const right = c.state === 'running' ? 'running' : c.state === 'error' ? 'failed' : duration((c.endedAt ?? now) - c.startedAt)
      const name = toolName(c.tool)
      const body = bodyOf(c.id)
      const subj = body ? subject({ tool: c.tool, input: body.input, isRunning: false, isErrored: false, isInterrupted: false }, where.cwd, where.home) : ''
      const room = inner - (1 + (c.agentId ? 4 : 1) + 2 + textWidth(name) + 1 + textWidth(right) + 2)
      return {
        id: c.id,
        glyph,
        glyphColor,
        tool: name,
        toolColor: toolTone(c.tool),
        subject: truncate(subj, Math.max(4, room)),
        right,
        rightColor: c.state === 'error' ? P.err : c.state === 'running' ? P.warn : P.subtle,
        isSelected: false,
        isSub: c.agentId !== undefined,
      }
    })
    const order = list.map(c => c.id)
    const shownId = isFollowing ? (order[order.length - 1] ?? null) : want && order.includes(want) ? want : (order[order.length - 1] ?? null)
    for (const r of rows) r.isSelected = r.id === shownId
    const maxList = Math.max(0, rows.length - at.listRows)
    const listOffset = offsets.list === FOLLOW || isFollowing ? maxList : clamp(offsets.list, 0, maxList)

    // The detail: its header, then the view that suits the tool.
    const ref = list.find(c => c.id === shownId)
    let head = null
    let detail: Detail = { rows: [] }
    if (ref) {
      const [glyph, color] = GLYPH[ref.state]
      const pill = ref.state === 'running' ? ' Calling ' : ref.state === 'error' ? ' Error ' : ' Done '
      const pillBg = ref.state === 'running' ? '#0c2d6b' : ref.state === 'error' ? '#5b0f14' : '#0f3d1e'
      head = [
        { parts: [{ text: ` ${glyph} `, color }, { text: toolName(ref.tool), color: toolTone(ref.tool), bold: true }, ...(ref.agentId ? [{ text: '  subagent', color: P.violet }] : [])] },
        { spacer: true as const },
        { parts: [{ text: pill, color, bg: pillBg, bold: true }, { text: `  ${duration((ref.endedAt ?? now) - ref.startedAt)} `, color: P.muted }] },
      ]
      detail = detailFor(ref, at.detailWidth - 2, at.detailRows, e.surface === 'terminal')
    }
    const maxDetail = Math.max(0, detail.rows.length - at.detailRows)
    const detailOffset = offsets.detailFor === shownId ? clamp(offsets.detail, 0, maxDetail) : 0

    drawn.at = at
    drawn.listTotal = rows.length
    drawn.detailTotal = detail.rows.length
    drawn.order = order
    drawn.shown = shownId

    return (
      <Panel
        m={{
          els,
          at,
          counts: { all: list.length, running: list.filter(c => c.state === 'running').length },
          follow: isFollowing,
          rows: rows.slice(listOffset, listOffset + at.listRows),
          listTotal: rows.length,
          listOffset,
          head,
          detail: detail.rows,
          image: detail.image,
          detailOffset,
        }}
      />
    )
  })
}
