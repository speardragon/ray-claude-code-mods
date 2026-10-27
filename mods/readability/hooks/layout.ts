// Blocks laid out as painted lines `width` cells wide. Lines wrap at spaces (anywhere in Hangul and
// CJK), list items hang under their text, and blocks are kept apart by one blank line: the same
// flow the engine's own drawing has, so swapping one for the other moves nothing but the colors.
import { highlight, isHighlighted } from './highlight'
import type { Block, Inline } from './markdown'
import { charWidth, expandTabs, textWidth } from './text'
import { T } from './theme'
import type { Paint } from './theme'

export type Span = { text: string; paint: Paint; href?: string }
export type Line = Span[]

const base: Paint = { color: T.text }

// ---- inline to spans --------------------------------------------------------------------------

function spansOf(inline: Inline[], paint: Paint = base, href?: string): Span[] {
  return inline.flatMap((node): Span[] => {
    switch (node.kind) {
      case 'text':
        return [{ text: node.text, paint, href }]
      case 'strong':
        return spansOf(node.children, { ...paint, weight: 'bold', color: paint.color === T.text ? T.strong : paint.color }, href)
      case 'em':
        return spansOf(node.children, { ...paint, italic: true }, href)
      case 'strike':
        return spansOf(node.children, { ...paint, strikethrough: true, color: T.muted }, href)
      case 'code':
        return [{ text: node.text, paint: { ...paint, color: T.code, backgroundColor: T.codeBg, italic: false }, href }]
      case 'link':
        return spansOf(node.children, { ...paint, color: T.link, underline: true }, node.href)
    }
  })
}

// ---- wrapping ---------------------------------------------------------------------------------

type Cell = { ch: string; w: number; span: Span }

const join = (cells: Cell[]): Line => {
  const line: Line = []
  for (const c of cells) {
    const last = line[line.length - 1]
    if (last && last.paint === c.span.paint && last.href === c.span.href) last.text += c.ch
    else line.push({ text: c.ch, paint: c.span.paint, href: c.span.href })
  }
  return line
}

const isWideCell = (c: Cell) => c.w === 2

// Lays spans into rows: the first after `first`, the rest after `rest` (both already painted).
export function wrap(spans: Span[], width: number, first: Span[] = [], rest: Span[] = []): Line[] {
  const lines: Line[] = []
  for (const paragraph of splitHard(spans)) {
    const cells: Cell[] = paragraph.flatMap(span => [...expandTabs(span.text)].map(ch => ({ ch, w: charWidth(ch), span })))
    let start = 0
    let isFirst = lines.length === 0
    if (cells.length === 0) {
      lines.push([...(isFirst ? first : rest)])
      continue
    }
    while (start < cells.length) {
      const lead = isFirst ? first : rest
      const room = Math.max(4, width - lead.reduce((n, s) => n + textWidth(s.text), 0))
      let used = 0
      let end = start
      let lastBreak = -1
      while (end < cells.length && used + cells[end]!.w <= room) {
        if (cells[end]!.ch === ' ' || isWideCell(cells[end]!)) lastBreak = end
        used += cells[end]!.w
        end++
      }
      // Full mid-word: go back to the last space (dropped), or to just after the last wide
      // character; a row ending at a space or by a wide character breaks where it is.
      const canBreakHere = end >= cells.length || cells[end]!.ch === ' ' || isWideCell(cells[end]!) || isWideCell(cells[end - 1]!)
      if (!canBreakHere && lastBreak >= start) end = cells[lastBreak]!.ch === ' ' ? Math.max(lastBreak, start + 1) : lastBreak + 1
      if (end === start) end = start + 1
      lines.push([...lead, ...join(cells.slice(start, end))])
      start = end
      while (start < cells.length && cells[start]!.ch === ' ') start++
      isFirst = false
    }
  }
  return lines
}

// Splits spans at newlines: a line break inside a paragraph stays one.
function splitHard(spans: Span[]): Span[][] {
  const out: Span[][] = [[]]
  for (const span of spans) {
    const parts = span.text.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) out.push([])
      if (part) out[out.length - 1]!.push({ ...span, text: part })
    })
  }
  return out
}

// ---- blocks to lines --------------------------------------------------------------------------

const span = (text: string, paint: Paint): Span => ({ text, paint })

// A terminal has one type size, so a heading reads big by its marks: its level in #s before it,
// and under the top two levels a rule, heavy for H1 across the width, light for H2 under the text.
function heading(level: number, inline: Inline[], width: number): Line[] {
  const color = T.heading[Math.min(level, 6) - 1]!
  const paint: Paint = { color, weight: 'bold' }
  const hashes = span(`${'#'.repeat(level)} `, { color: T.hash, weight: 'bold' })
  const lines = wrap(spansOf(inline, paint), width, [hashes], [span(' '.repeat(level + 1), {})])
  const textWide = Math.max(...lines.map(l => l.reduce((n, s) => n + textWidth(s.text), 0)))
  if (level === 1) lines.push([span('━'.repeat(Math.max(8, width)), { color })])
  if (level === 2) lines.push([span('─'.repeat(Math.min(width, Math.max(8, textWide))), { color: T.rule })])
  return lines
}

// A code block in a rounded frame, its language set in the top edge, on a panel a shade lighter
// than the terminal: the frame is what sets it apart on a dark background.
function codeBlock(lang: string, body: string[], width: number): Line[] {
  const inner = Math.max(8, width - 4) // the frame's two cells and a cell of padding each side
  const frame = { color: T.box }
  const label = lang ? ` ${lang} ` : ''
  const rows: Line[] = [[span(`╭─${label}${'─'.repeat(Math.max(0, inner + 1 - textWidth(label)))}╮`, frame)]]
  const fill = (line: Line): Line => {
    const used = line.reduce((n, s) => n + textWidth(s.text), 0)
    return [
      span('│', frame),
      span(' ', { backgroundColor: T.blockBg }),
      ...line,
      span(' '.repeat(Math.max(0, inner - used) + 1), { backgroundColor: T.blockBg }),
      span('│', frame),
    ]
  }
  for (const raw of body.length > 0 ? body : ['']) {
    const tokens = isHighlighted(lang) ? highlight(expandTabs(raw), lang) : [{ text: expandTabs(raw), kind: 'plain' as const }]
    const spans = tokens.map(t => span(t.text, { color: T.syntax[t.kind], backgroundColor: T.blockBg }))
    for (const line of wrap(spans, inner)) rows.push(fill(line))
  }
  rows.push([span(`╰${'─'.repeat(inner + 2)}╯`, frame)])
  return rows
}

function table(block: Extract<Block, { kind: 'table' }>, width: number): Line[] {
  const head = block.head.map(c => spansOf(c, { color: T.tableHead, weight: 'bold' }))
  const rows = block.rows.map(r => block.head.map((_, i) => spansOf(r[i] ?? [])))
  const n = head.length
  const natural = Array.from({ length: n }, (_, i) =>
    Math.max(3, ...[head[i]!, ...rows.map(r => r[i]!)].map(cell => cell.reduce((w, s) => w + textWidth(s.text), 0))),
  )
  // Borders take n + 1 cells and padding 2 per column; shrink the widest columns until it fits.
  const room = Math.max(n * 4, width - (n + 1) - n * 2)
  const widths = [...natural]
  while (widths.reduce((a, b) => a + b, 0) > room) {
    const widest = widths.indexOf(Math.max(...widths))
    if (widths[widest]! <= 4) break
    widths[widest]!--
  }
  const border = (l: string, m: string, r: string) => [span(l + widths.map(w => '─'.repeat(w + 2)).join(m) + r, { color: T.tableBorder })]
  const row = (cells: Span[][]): Line[] => {
    const wrapped = cells.map((cell, i) => wrap(cell, widths[i]!))
    const height = Math.max(1, ...wrapped.map(w => w.length))
    return Array.from({ length: height }, (_, y) => {
      const line: Line = [span('│', { color: T.tableBorder })]
      wrapped.forEach((cell, i) => {
        const content = cell[y] ?? []
        const used = content.reduce((n, s) => n + textWidth(s.text), 0)
        const gap = widths[i]! - used
        const align = block.align[i] ?? 'left'
        const left = align === 'right' ? gap : align === 'center' ? Math.floor(gap / 2) : 0
        line.push(span(' '.repeat(1 + left), {}), ...content, span(' '.repeat(1 + gap - left), {}), span('│', { color: T.tableBorder }))
      })
      return line
    })
  }
  // A rule under the header and between every body row, so a row that wraps reads as one.
  const between = border('├', '┼', '┤')
  return [border('┌', '┬', '┐'), ...row(head), between, ...rows.flatMap((r, i) => [...(i > 0 ? [between] : []), ...row(r)]), border('└', '┴', '┘')]
}

export function layoutBlocks(blocks: Block[], width: number, depth = 0): Line[] {
  const out: Line[] = []
  blocks.forEach((block, i) => {
    if (i > 0) out.push([])
    switch (block.kind) {
      case 'heading':
        out.push(...heading(block.level, block.inline, width))
        break
      case 'paragraph':
        out.push(...wrap(spansOf(block.inline), width))
        break
      case 'code':
        out.push(...codeBlock(block.lang, block.lines, width))
        break
      case 'rule':
        out.push([span('─'.repeat(Math.max(4, width)), { color: T.rule })])
        break
      case 'quote': {
        const bar = span('▌ ', { color: T.quoteBar })
        for (const line of layoutBlocks(block.blocks, width - 2, depth)) {
          out.push([bar, ...line.map(s => ({ ...s, paint: { ...s.paint, color: s.paint.color === T.text ? T.muted : s.paint.color, italic: true } }))])
        }
        break
      }
      case 'list': {
        // A loose list (an item of several paragraphs) keeps a blank line between items; a nested
        // list sits right under its item's text, as the engine draws it.
        const isLoose = block.items.some(item => item.blocks.filter(b => b.kind !== 'list').length > 1)
        block.items.forEach((item, n) => {
          if (n > 0 && isLoose) out.push([])
          const marker = block.ordered
            ? span(`${item.marker} `.padStart(Math.max(...block.items.map(it => it.marker.length)) + 1), { color: T.number, weight: 'bold' })
            : item.task === 'done'
              ? span('☑ ', { color: T.done })
              : item.task === 'todo'
                ? span('☐ ', { color: T.muted })
                : span('• ', { color: T.bullet[depth % T.bullet.length] })
          const indent = span(' '.repeat(textWidth(marker.text)), {})
          const room = width - textWidth(marker.text)
          const inner = item.blocks.flatMap((b, k) => [...(k > 0 && b.kind !== 'list' ? [[] as Line] : []), ...layoutBlocks([b], room, depth + 1)])
          inner.forEach((line, k) => out.push([k === 0 ? marker : indent, ...line]))
          if (inner.length === 0) out.push([marker])
        })
        break
      }
      case 'table':
        out.push(...table(block, width))
        break
    }
  })
  return out
}
