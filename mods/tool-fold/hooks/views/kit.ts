// What every detail view is made of: painted spans in rows a fixed width wide, wrapped by cells
// (Hangul and CJK two each), and the palette the views share.
import { charWidth, expandTabs, textWidth, truncate } from '../text'

export type Paint = {
  color?: string
  backgroundColor?: string
  weight?: 'bold'
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}
export type Span = { text: string; paint: Paint }
export type Line = Span[]

export const P = {
  bg: '#0d1117',
  panel: '#161b22', // a window, a card, an editor
  bar: '#1c2128', // a title bar, a search bar
  border: '#30363d',
  frame: '#6e7681',
  fg: '#e6edf3',
  text: '#c9d1d9',
  muted: '#8b949e',
  subtle: '#6e7681',
  faint: '#484f58',
  accent: '#2f81f7',
  ok: '#3fb950',
  err: '#f85149',
  warn: '#d29922',
  violet: '#d2a8ff',
  readTint: '#14243a', // the lines a Read took
  match: '#5c4813', // a search hit
  addLine: '#12261e',
  addNum: '#1c4428',
  addFg: '#3fb950',
  delLine: '#25171c',
  delNum: '#542426',
  delFg: '#f85149',
  dots: ['#ff5f57', '#febc2e', '#28c840'],
} as const

export const s = (text: string, paint: Paint = {}): Span => ({ text, paint })
export const widthOf = (line: Line) => line.reduce((n, sp) => n + textWidth(sp.text), 0)
export const blank = (): Line => []

// A line filled to `width` with `bg`, its spans keeping their own backgrounds.
export function fill(line: Line, width: number, bg?: string): Line {
  const used = widthOf(line)
  const painted = bg ? line.map(sp => (sp.paint.backgroundColor ? sp : { ...sp, paint: { ...sp.paint, backgroundColor: bg } })) : line
  return used >= width ? painted : [...painted, s(' '.repeat(width - used), bg ? { backgroundColor: bg } : {})]
}

// Left and right parts on one line, the left cut to leave room for the right.
export function spread(left: Line, right: Line, width: number, bg?: string): Line {
  const rw = widthOf(right)
  const room = Math.max(0, width - rw - 1)
  const cut: Line = []
  let used = 0
  for (const sp of left) {
    if (used >= room) break
    const text = textWidth(sp.text) + used > room ? truncate(sp.text, room - used) : sp.text
    cut.push({ ...sp, text })
    used += textWidth(text)
  }
  const gap = Math.max(1, width - used - rw)
  return fill([...cut, s(' '.repeat(gap), bg ? { backgroundColor: bg } : {}), ...right], width, bg)
}

// Spans laid into rows of `width` cells, broken after a space where one falls late enough in the
// row (anywhere in Hangul and CJK, which need none); later rows start with `indent`.
export function wrap(spans: Span[], width: number, indent: Line = []): Line[] {
  type Cell = { ch: string; w: number; paint: Paint }
  const cells: Cell[] = spans.flatMap(sp => [...expandTabs(sp.text)].map(ch => ({ ch, w: charWidth(ch), paint: sp.paint })))
  const join = (part: Cell[]): Line => {
    const line: Line = []
    for (const c of part) {
      const last = line[line.length - 1]
      if (last && last.paint === c.paint) last.text += c.ch
      else line.push({ text: c.ch, paint: c.paint })
    }
    return line
  }
  const rows: Line[] = []
  let start = 0
  while (start < cells.length || rows.length === 0) {
    const room = Math.max(4, width - (rows.length === 0 ? 0 : widthOf(indent)))
    let used = 0
    let end = start
    while (end < cells.length && used + cells[end]!.w <= room) used += cells[end++]!.w
    if (end < cells.length && cells[end]!.ch !== ' ' && cells[end]!.w === 1) {
      // Mid-word: go back to the last space, if it leaves the row at least two thirds full.
      let back = end
      while (back > start && cells[back - 1]!.ch !== ' ') back--
      if (back > start && back - start >= (room * 2) / 3) end = back
    }
    if (end === start && start < cells.length) end = start + 1
    rows.push([...(rows.length === 0 ? [] : indent), ...join(cells.slice(start, end))])
    start = end
    if (start >= cells.length) break
  }
  return rows
}

// Text in rows, one source line after another, each wrapped (or cut) to `width`.
export function textRows(text: string, width: number, paint: Paint, isWrapped = true, maxLines = 4000): Line[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const shown = lines.slice(0, maxLines)
  const rows = shown.flatMap(l => (isWrapped ? wrap([s(l, paint)], width) : [[s(truncate(expandTabs(l), width), paint)]]))
  if (lines.length > maxLines) rows.push([s(`⋯ ${lines.length - maxLines} more lines`, { color: P.subtle, italic: true })])
  return rows
}

// A badge: ` label ` in `fg` on `bg`.
export const badge = (label: string, fg: string, bg: string): Span => s(` ${label} `, { color: fg, backgroundColor: bg, weight: 'bold' })

// A section title, as `INPUT` and `RESULT` read.
export const section = (title: string, right = ''): Line => [s(title, { color: P.muted, weight: 'bold' }), ...(right ? [s(`  ${right}`, { color: P.subtle })] : [])]

export const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function duration(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

// A rounded frame around rows: `title` set in its top edge, the body on `bg`.
export function frame(rows: Line[], width: number, title: Line = [], bg: string = P.panel, color: string = P.frame): Line[] {
  const inner = Math.max(4, width - 4)
  const tw = widthOf(title)
  const top: Line = [s('╭─', { color }), ...(tw ? [s(' '), ...title, s(' ')] : []), s('─'.repeat(Math.max(0, inner + 1 - (tw ? tw + 2 : 0))) + '╮', { color })]
  const body = rows.map(r => [s('│', { color }), s(' ', { backgroundColor: bg }), ...fill(r, inner, bg), s(' ', { backgroundColor: bg }), s('│', { color })])
  return [top, ...body, [s(`╰${'─'.repeat(inner + 2)}╯`, { color })]]
}
