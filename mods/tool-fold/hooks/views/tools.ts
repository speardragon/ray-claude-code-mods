// Each built-in tool in a view that suits it: Bash as a terminal window, Read as a file with the read
// lines lit, Write and Edit as an editor with a diff, Grep and Glob as a search with its hits, the
// web tools as an address bar, Agent as a card, TodoWrite as a checklist, anything else as its
// input and result laid out as key/value rows and a colored tree.
import { highlight, isHighlighted } from '../highlight'
import { textWidth, truncate } from '../text'
import { parseText, tree, BSON } from './json'
import { markdownish, moreView } from './more'
import type { Line, Span } from './kit'
import { P, badge, blank, fill, frame, kb, s, section, spread, textRows, wrap } from './kit'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dir = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'

export type ViewInput = { tool: string; input: unknown; result: unknown; text: string | undefined; state: 'running' | 'done' | 'error'; ms?: number; cwd: string; home: string; width: number }

const rel = (path: string, v: ViewInput) => {
  if (v.cwd && path.startsWith(`${v.cwd}/`)) return path.slice(v.cwd.length + 1)
  if (v.home && path.startsWith(`${v.home}/`)) return `~/${path.slice(v.home.length + 1)}`
  return path
}

const langOf = (path: string) => (path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '')

function codeRows(lines: string[], lang: string, startLine: number, width: number, lit?: [number, number]): Line[] {
  const gw = String(startLine + lines.length - 1).length
  const room = Math.max(8, width - gw - 2)
  return lines.flatMap((raw, i) => {
    const no = startLine + i
    const isLit = lit !== undefined && no >= lit[0] && no <= lit[1]
    const bg = isLit ? P.readTint : undefined
    const toks = isHighlighted(lang) ? highlight(raw, lang) : [{ text: raw, kind: 'plain' as const }]
    const spans: Span[] = toks.map(t => s(t.text, { color: SYNTAX[t.kind], ...(bg ? { backgroundColor: bg } : {}) }))
    const parts = wrap(spans, room)
    return parts.map((part, k) => fill([s(k === 0 ? String(no).padStart(gw) : ' '.repeat(gw), { color: isLit ? P.accent : P.faint, ...(bg ? { backgroundColor: bg } : {}) }), s(isLit && k === 0 ? '▎' : ' ', { color: P.accent, ...(bg ? { backgroundColor: bg } : {}) }), s(' ', bg ? { backgroundColor: bg } : {}), ...part], width, bg))
  })
}

const SYNTAX = { plain: '#c9d1d9', comment: '#8b949e', string: '#a5d6ff', number: '#79c0ff', keyword: '#ff7b72', type: '#ffa657', call: '#d2a8ff', punct: '#8b949e', key: '#7ee787' } as const

// ---- Bash: a terminal window --------------------------------------------------------------------

function shell(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const inner = v.width - 4
  const title = str(i.description) || 'Terminal'
  const bar: Line = spread([s('● ', { color: P.dots[0] }), s('● ', { color: P.dots[1] }), s('●  ', { color: P.dots[2] }), s(title, { color: P.muted })], [s(v.state === 'running' ? 'running…' : '', { color: P.warn })], inner, P.bar)
  const body: Line[] = [bar, []]
  const cmd = highlight(str(i.command), 'sh').map(t => s(t.text, { color: SYNTAX[t.kind] }))
  body.push(...wrap([s('$ ', { color: P.ok, weight: 'bold' }), ...cmd], inner, [s('  ')]))
  const stdout = v.state === 'error' ? '' : str(out.stdout)
  const stderr = v.state === 'error' ? str(v.text) || str(v.result) : str(out.stderr)
  if (stdout) body.push(...textRows(stdout.replace(/\n$/, ''), inner, { color: P.text }, true, 400))
  if (stderr) body.push(...textRows(stderr.replace(/\n$/, ''), inner, { color: P.err }, true, 200))
  if (!stdout && !stderr && v.state === 'done') body.push([s('(no output)', { color: P.subtle, italic: true })])
  if (v.state === 'running') body.push([s('▍', { color: P.fg })])
  const rows = frame(body, v.width, [], P.panel)
  if (v.state === 'error') rows.push([s('✗ Exited with an error', { color: P.err, weight: 'bold' })])
  else if (out.backgroundTaskId) rows.push([s('◐ Running in the background', { color: P.warn })])
  else if (out.timedOutAfterMs) rows.push([s('✗ Timed out', { color: P.err })])
  return rows
}

// ---- Read: the file, the lines read lit -----------------------------------------------------------

function fileHead(path: string, subtitle: string, v: ViewInput, right: Line = []): Line[] {
  return [
    spread([s('▤ ', { color: P.accent }), s(base(path), { color: P.fg, weight: 'bold' }), s(`  ${rel(dir(path), v)}`, { color: P.subtle })], right, v.width),
    [s(subtitle, { color: P.muted })],
  ]
}

function read(v: ViewInput): Line[] {
  const i = obj(v.input)
  const file = obj(obj(v.result).file)
  const path = str(i.file_path) || str(file.filePath)
  const start = typeof file.startLine === 'number' ? file.startLine : typeof i.offset === 'number' ? i.offset : 1
  const n = typeof file.numLines === 'number' ? file.numLines : 0
  const total = typeof file.totalLines === 'number' ? file.totalLines : n
  const rows = fileHead(path, n ? `Read lines ${start}–${start + n - 1} of ${total}` : v.state === 'running' ? 'Reading…' : 'Read', v)
  // Where the read range sits in the file, as a minimap bar.
  if (total > 0) {
    const w = v.width
    const a = Math.floor(((start - 1) / total) * w)
    const b = Math.max(a + 1, Math.ceil(((start - 1 + n) / total) * w))
    rows.push([s('─'.repeat(a), { color: P.faint }), s('━'.repeat(Math.min(w, b) - a), { color: P.accent }), s('─'.repeat(Math.max(0, w - b)), { color: P.faint })])
  }
  rows.push(blank())
  const content = str(file.content)
  if (content) rows.push(...codeRows(content.replace(/\n$/, '').split('\n').slice(0, 2000), langOf(path), start, v.width, [start, start + n - 1]))
  else if (v.state === 'error') rows.push(...textRows(str(v.text), v.width, { color: P.err }))
  return rows
}

// ---- Write / Edit: an editor and a diff -----------------------------------------------------------

type Hunk = { oldStart: number; newStart: number; lines: string[] }

function diffRows(hunks: Hunk[], width: number): Line[] {
  const rows: Line[] = []
  const maxNo = Math.max(1, ...hunks.map(h => h.oldStart + h.newStart + h.lines.length))
  const gw = String(maxNo).length
  hunks.forEach((h, k) => {
    if (k > 0) rows.push([s('⋯', { color: P.subtle })])
    let o = h.oldStart
    let n = h.newStart
    for (const line of h.lines) {
      const mark = line[0] ?? ' '
      const body = line.slice(1)
      const type = mark === '+' ? 'add' : mark === '-' ? 'del' : 'eq'
      const bg = type === 'add' ? P.addLine : type === 'del' ? P.delLine : undefined
      const nums = `${type === 'add' ? ' '.repeat(gw) : String(o).padStart(gw)} ${type === 'del' ? ' '.repeat(gw) : String(n).padStart(gw)} `
      const parts = wrap([s(body, { color: P.text, ...(type === 'del' ? { strikethrough: false } : {}) })], Math.max(8, width - nums.length - 2))
      parts.forEach((part, j) => {
        rows.push(fill([s(j === 0 ? nums : ' '.repeat(nums.length), { color: P.subtle, backgroundColor: type === 'add' ? P.addNum : type === 'del' ? P.delNum : undefined }), s(j === 0 ? `${type === 'add' ? '+' : type === 'del' ? '−' : ' '} ` : '  ', { color: type === 'add' ? P.addFg : type === 'del' ? P.delFg : P.subtle, ...(bg ? { backgroundColor: bg } : {}) }), ...part.map(sp => (bg ? { ...sp, paint: { ...sp.paint, backgroundColor: bg } } : sp))], width, bg))
      })
      if (type !== 'add') o++
      if (type !== 'del') n++
    }
  })
  return rows
}

function edit(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const path = str(i.file_path) || str(i.notebook_path) || str(out.filePath)
  const patch = Array.isArray(out.structuredPatch) ? (out.structuredPatch as Hunk[]) : []
  const lines = patch.flatMap(h => h.lines ?? [])
  const adds = lines.filter(l => l.startsWith('+')).length
  const dels = lines.filter(l => l.startsWith('-')).length
  const isNew = v.tool === 'Write' && out.type === 'create'
  const content = str(i.content)
  const right: Line = isNew ? [badge('new', P.bg, P.ok)] : [s(`+${adds} `, { color: P.addFg, weight: 'bold' }), s(`−${dels}`, { color: P.delFg, weight: 'bold' })]
  const at = patch[0] ? `at line ${patch[0].newStart}` : ''
  const verb = v.tool === 'Write' ? (v.state === 'running' ? 'Writing' : 'Written') : v.state === 'running' ? 'Editing' : 'Edited'
  const rows = fileHead(path, [verb, isNew || v.tool === 'Write' ? `${content.split('\n').length} lines` : at].filter(Boolean).join(' · '), v, right)
  // The editor's tab: the file name, a dot while it is being written, its language.
  rows.push(fill([s(` ${base(path)} `, { color: P.fg, backgroundColor: P.panel }), s(v.state === 'running' ? '● ' : '  ', { color: P.warn, backgroundColor: P.panel }), s(' '), badge(langOf(path) || 'text', P.muted, P.bar)], v.width))
  rows.push(blank())
  if (v.state === 'error') return [...rows, ...textRows(str(v.text), v.width, { color: P.err })]
  if (isNew || (v.tool === 'Write' && patch.length === 0)) return [...rows, ...codeRows(content.replace(/\n$/, '').split('\n').slice(0, 2000), langOf(path), 1, v.width)]
  if (patch.length > 0) return [...rows, ...diffRows(patch, v.width)]
  // Before the result arrives: the edit as asked, old against new.
  const edits = Array.isArray(i.edits) ? (i.edits as Record<string, unknown>[]) : [{ old_string: i.old_string, new_string: i.new_string }]
  const hunks = edits.map(e => ({ oldStart: 0, newStart: 0, lines: [...str(e.old_string).split('\n').map(l => `-${l}`), ...str(e.new_string).split('\n').map(l => `+${l}`)] }))
  return [...rows, ...diffRows(hunks, v.width)]
}

// ---- Grep / Glob: a search ------------------------------------------------------------------------

function search(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const pattern = str(i.pattern)
  const text = str(v.text) || str(out.content)
  const files = Array.isArray(out.filenames) ? (out.filenames as string[]) : []
  const hits = (text ? text.split('\n') : files).filter(l => l && !/^(Found |No )/.test(l)).slice(0, 300)
  const count = typeof out.numMatches === 'number' ? out.numMatches : typeof out.numFiles === 'number' ? out.numFiles : hits.length
  const rows: Line[] = [
    fill([s(' ⌕ ', { color: P.muted, backgroundColor: P.bar }), s(pattern, { color: P.fg, weight: 'bold', backgroundColor: P.bar }), s(' '.repeat(Math.max(1, v.width - textWidth(pattern) - 3 - `${count} results`.length - 1)), { backgroundColor: P.bar }), s(v.state === 'running' ? 'searching…' : `${count} results`, { color: P.muted, backgroundColor: P.bar }), s(' ', { backgroundColor: P.bar })], v.width, P.bar),
  ]
  const tags = (['path', 'glob', 'type', 'output_mode'] as const).filter(k => typeof i[k] === 'string')
  if (tags.length) rows.push(tags.flatMap(k => [badge(`${k} ${k === 'path' ? rel(str(i[k]), v) : str(i[k])}`, P.muted, P.bar), s(' ')]))
  rows.push(blank())
  let re: RegExp | null = null
  try {
    re = pattern && v.tool !== 'Glob' ? new RegExp(pattern, 'g') : null
  } catch {
    re = null
  }
  for (const hit of hits) {
    const m = hit.match(/^(.+?):(\d+):(.*)$/)
    const where = m ? `${base(m[1]!)}:${m[2]}` : rel(hit, v)
    const line = m ? m[3]! : ''
    const spans: Span[] = [s(m ? base(m[1]!) : rel(hit, v), { color: P.accent }), ...(m ? [s(`:${m[2]}`, { color: P.subtle })] : [])]
    if (m) {
      spans.push(s('  '))
      let at = 0
      for (const found of re ? line.matchAll(re) : []) {
        if (found.index === undefined || found[0] === '') break
        spans.push(s(line.slice(at, found.index), { color: P.text }), s(found[0], { color: P.fg, backgroundColor: P.match, weight: 'bold' }))
        at = found.index + found[0].length
      }
      spans.push(s(line.slice(at), { color: P.text }))
    }
    rows.push(...wrap(spans, v.width, [s(' '.repeat(Math.min(12, textWidth(where) + 2)))]).slice(0, 3))
  }
  return rows
}

// ---- WebFetch / WebSearch: an address bar ---------------------------------------------------------

function web(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const isSearch = v.tool === 'WebSearch'
  const address = isSearch ? str(i.query) : str(i.url)
  const status = typeof out.code === 'number' ? `${out.code} ${str(out.codeText)}` : ''
  const rows: Line[] = [
    fill([s(isSearch ? ' ⌕ ' : ' ↗ ', { color: P.muted, backgroundColor: P.bar }), s(truncate(address, v.width - 24), { color: P.fg, backgroundColor: P.bar }), s(' '.repeat(Math.max(1, v.width - textWidth(truncate(address, v.width - 24)) - 4 - textWidth(status) - 1)), { backgroundColor: P.bar }), s(status, { color: typeof out.code === 'number' && out.code >= 400 ? P.err : P.ok, backgroundColor: P.bar })], v.width, P.bar),
    v.state === 'running' ? [s('━'.repeat(Math.floor(v.width / 3)), { color: P.accent }), s('─'.repeat(v.width - Math.floor(v.width / 3)), { color: P.faint })] : [s('─'.repeat(v.width), { color: P.faint })],
  ]
  if (typeof out.bytes === 'number') rows.push([s(`${kb(out.bytes)}`, { color: P.muted })])
  if (i.prompt) rows.push(blank(), section('PROMPT'), ...textRows(str(i.prompt), v.width, { color: P.muted, italic: true }, true, 6))
  if (isSearch && Array.isArray(out.results)) {
    rows.push(blank(), section('RESULTS'))
    for (const r of (out.results as unknown[]).flatMap(x => (Array.isArray(obj(x).content) ? (obj(x).content as unknown[]) : [x])).slice(0, 30)) {
      const o = obj(r)
      if (o.title || o.url) {
        const host = str(o.url).replace(/^https?:\/\//, '').split('/')[0] ?? ''
        rows.push(...wrap([s('• ', { color: P.accent }), s(str(o.title), { color: P.fg, weight: 'bold' })], v.width, [s('  ')]), [s(`  ${host}`, { color: P.ok }), s(` ${str(o.url).slice(str(o.url).indexOf(host) + host.length)}`, { color: P.subtle })])
      } else if (typeof r === 'string') rows.push(...markdownish(r, v.width))
    }
  }
  const body = str(out.result) || (v.state !== 'running' ? str(v.text) : '')
  if (body) rows.push(blank(), section('RESULT'), ...markdownish(body, v.width))
  return rows
}

// ---- Agent: a card ---------------------------------------------------------------------------------

function agent(v: ViewInput): Line[] {
  const i = obj(v.input)
  const head = spread([s('◉ ', { color: P.violet }), s(str(i.description) || 'Subagent', { color: P.fg, weight: 'bold' })], [badge(str(i.subagent_type) || 'agent', P.violet, '#2a1f3d')], v.width - 4, P.panel)
  const body = [head, [], ...textRows(str(i.prompt), v.width - 4, { color: P.muted }, true, 14)]
  const rows = frame(body, v.width, [], P.panel, '#6e5494')
  const answer = str(obj(v.result).text) || (Array.isArray(obj(v.result).content) ? (obj(v.result).content as unknown[]).map(c => str(obj(c).text)).join('\n') : '') || (v.state !== 'running' ? str(v.text) : '')
  if (answer) rows.push(blank(), section('RESULT'), ...markdownish(answer, v.width))
  else if (v.state === 'running') rows.push(blank(), [s('◐ Working…', { color: P.warn })])
  return rows
}

// ---- TodoWrite: a checklist ----------------------------------------------------------------------

function todo(v: ViewInput): Line[] {
  const todos = (Array.isArray(obj(v.input).todos) ? obj(v.input).todos : []) as Record<string, unknown>[]
  const done = todos.filter(t => t.status === 'completed').length
  const w = Math.max(10, v.width - 20)
  const filled = todos.length ? Math.round((done / todos.length) * w) : 0
  const rows: Line[] = [
    spread([s('Plan', { color: P.fg, weight: 'bold' })], [s(`${done}/${todos.length}`, { color: P.muted })], v.width),
    [s('█'.repeat(filled), { color: P.accent }), s('░'.repeat(w - filled), { color: P.faint })],
    blank(),
  ]
  for (const t of todos) {
    const st = str(t.status)
    const mark = st === 'completed' ? s('✓ ', { color: P.ok }) : st === 'in_progress' ? s('◐ ', { color: P.warn }) : s('○ ', { color: P.subtle })
    const label = st === 'in_progress' ? str(t.activeForm) || str(t.content) : str(t.content)
    const paint = st === 'completed' ? { color: P.subtle, strikethrough: true } : st === 'in_progress' ? { color: P.fg, weight: 'bold' as const } : { color: P.text }
    rows.push(...wrap([mark, s(label, paint)], v.width, [s('  ')]).map(r => (st === 'in_progress' ? fill(r, v.width, P.panel) : r)))
  }
  return rows
}

// ---- anything else: input as key/value rows, the result as a tree ---------------------------------

export function generic(v: ViewInput, server?: string): Line[] {
  const i = obj(v.input)
  const rows: Line[] = []
  if (server) rows.push([s(`${server} · MCP`, { color: P.muted })], blank())
  rows.push(section('INPUT'))
  const keys = Object.keys(i)
  const kw = Math.min(18, Math.max(4, ...keys.map(k => k.length)))
  if (keys.length === 0) rows.push([s('(none)', { color: P.subtle, italic: true })])
  for (const k of keys) {
    const val = i[k]
    const text = typeof val === 'string' ? val : JSON.stringify(val)
    rows.push(...wrap([s(k.padStart(kw), { color: P.muted }), s('  '), s(text ?? '', { color: typeof val === 'string' ? BSON.string : P.text })], v.width, [s(' '.repeat(kw + 2))]).slice(0, 8))
  }
  rows.push(blank())
  if (v.state === 'running') return [...rows, [s('◐ Calling…', { color: P.accent })]]
  const parsed = v.result !== undefined && typeof v.result === 'object' ? v.result : parseText(v.text)
  const text = str(v.text)
  const meta = parsed !== undefined ? `JSON · ${kb(JSON.stringify(parsed)?.length ?? 0)}` : `${text.split('\n').length} lines`
  rows.push(section(v.state === 'error' ? 'ERROR' : 'RESULT', meta))
  if (v.state === 'error') return [...rows, ...textRows(text || str(v.result), v.width, { color: P.err })]
  return [...rows, ...(parsed !== undefined ? tree(parsed, v.width, { depth: 4, fields: 40 }) : markdownish(text, v.width))]
}

export function toolView(v: ViewInput): Line[] {
  switch (v.tool) {
    case 'Bash':
    case 'BashOutput':
      return shell(v)
    case 'Read':
      return read(v)
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return edit(v)
    case 'Grep':
    case 'Glob':
      return search(v)
    case 'WebFetch':
    case 'WebSearch':
      return web(v)
    case 'Agent':
    case 'Task':
      return agent(v)
    case 'TodoWrite':
      return todo(v)
    default: {
      const more = moreView(v)
      if (more) return more
      const mcp = v.tool.match(/^mcp__(.+?)__(.+)$/)
      return generic(v, mcp ? mcp[1]!.replace(/^(claude_ai_|plugin_[^_]+_)/, '') : undefined)
    }
  }
}
