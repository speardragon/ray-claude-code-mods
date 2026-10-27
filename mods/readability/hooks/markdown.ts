// A reply's markdown as blocks, tolerant of a reply cut off mid-way (a fence not yet closed, a
// table with half its rows): every prefix of a reply parses, so a reply drawn as it streams never
// waits for its end to look right.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'strike'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }

export type ListItem = { marker: string; task?: 'done' | 'todo'; blocks: Block[] }

export type Block =
  | { kind: 'heading'; level: number; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'code'; lang: string; lines: string[]; isOpen: boolean }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'table'; align: ('left' | 'center' | 'right')[]; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'rule' }

// ---- inline -----------------------------------------------------------------------------------

const PAIRS: [string, 'strong' | 'em' | 'strike'][] = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'strike'],
  ['*', 'em'],
  ['_', 'em'],
]

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ kind: 'text', text })
    text = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (ch === '\\' && i + 1 < src.length && /[\\`*_~[\]()#>!|-]/.test(src[i + 1]!)) {
      text += src[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const run = src.slice(i).match(/^`+/)![0]
      const end = src.indexOf(run, i + run.length)
      if (end > 0) {
        flush()
        out.push({ kind: 'code', text: src.slice(i + run.length, end).replace(/^ (.*) $/, '$1') })
        i = end + run.length
        continue
      }
    }
    if (ch === '[') {
      const m = src.slice(i).match(/^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
      if (m) {
        flush()
        out.push({ kind: 'link', href: m[2]!, children: parseInline(m[1]!) })
        i += m[0].length
        continue
      }
    }
    if (ch === '<') {
      const m = src.slice(i).match(/^<(https?:\/\/[^>\s]+)>/)
      if (m) {
        flush()
        out.push({ kind: 'link', href: m[1]!, children: [{ kind: 'text', text: m[1]! }] })
        i += m[0].length
        continue
      }
    }
    const pair = PAIRS.find(([mark]) => src.startsWith(mark, i))
    if (pair) {
      const [mark, kind] = pair
      const inner = src.slice(i + mark.length)
      // An opener must touch text, and `_` inside a word (snake_case) is no emphasis.
      const isWordUnderscore = mark[0] === '_' && i > 0 && /\w/.test(src[i - 1]!)
      const close = inner.search(new RegExp(`(?<=\\S)${mark.replace(/[*~]/g, c => `\\${c}`)}(?!${mark[0] === '*' ? '\\*' : mark[0] === '_' ? '_' : '~'})`))
      if (!isWordUnderscore && close > 0 && !/^\s/.test(inner)) {
        flush()
        out.push({ kind, children: parseInline(inner.slice(0, close)) })
        i += mark.length + close + mark.length
        continue
      }
    }
    const url = src.slice(i).match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/)
    if (url && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
      flush()
      out.push({ kind: 'link', href: url[0], children: [{ kind: 'text', text: url[0] }] })
      i += url[0].length
      continue
    }
    text += ch
    i++
  }
  flush()
  return out
}

// ---- blocks -----------------------------------------------------------------------------------

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const BULLET = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s+)?(.*)$/
const NUMBER = /^(\s*)(\d{1,9})([.)])\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.trim())

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  let para: string[] = []
  const endParagraph = () => {
    if (para.length > 0) blocks.push({ kind: 'paragraph', inline: parseInline(para.join('\n')) })
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]!
    const fence = line.match(FENCE)
    if (fence) {
      endParagraph()
      const [, indent, mark, lang] = fence
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trimStart().startsWith(mark!)) {
        body.push(lines[i]!.startsWith(indent!) ? lines[i]!.slice(indent!.length) : lines[i]!)
        i++
      }
      const isOpen = i >= lines.length
      blocks.push({ kind: 'code', lang: lang ?? '', lines: body, isOpen })
      i++
      continue
    }
    if (line.trim() === '') {
      endParagraph()
      i++
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      endParagraph()
      blocks.push({ kind: 'heading', level: heading[1]!.length, inline: parseInline(heading[2]!) })
      i++
      continue
    }
    if (RULE.test(line) && !(para.length > 0 && /^\s*-+\s*$/.test(line))) {
      endParagraph()
      blocks.push({ kind: 'rule' })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && cellsOf(line).length > 1) {
      endParagraph()
      const head = cellsOf(line)
      const align = cellsOf(lines[i + 1]!).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left') as 'left' | 'center' | 'right')
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(cellsOf(lines[i]!).map(parseInline))
        i++
      }
      blocks.push({ kind: 'table', align, head: head.map(parseInline), rows })
      continue
    }
    if (QUOTE.test(line)) {
      endParagraph()
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        body.push(lines[i]!.match(QUOTE)![1]!)
        i++
      }
      blocks.push({ kind: 'quote', blocks: parseBlocks(body.join('\n')) })
      continue
    }
    const bullet = line.match(BULLET)
    const number = line.match(NUMBER)
    if ((bullet || number) && (para.length === 0 || (number ? number[2] === '1' : true))) {
      endParagraph()
      const parsed = parseList(lines, i)
      blocks.push(parsed.block)
      i = parsed.next
      continue
    }
    para.push(line.trim())
    i++
  }
  endParagraph()
  return blocks
}

// A list and its nested items: each item's lines are those indented past its marker.
function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = lines[start]!.match(BULLET) ?? lines[start]!.match(NUMBER)!
  const ordered = !lines[start]!.match(BULLET)
  const base = first[1]!.length
  const items: ListItem[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]!
    const m = ordered ? line.match(NUMBER) : line.match(BULLET)
    if (!m || m[1]!.length !== base) break
    const marker = ordered ? `${m[2]}${m[3]}` : m[2]!
    const task = !ordered && m[3] !== undefined ? (m[3] === ' ' ? 'todo' : 'done') : undefined
    const body = [ordered ? m[4]! : m[4]!]
    const contentIndent = line.length - line.trimStart().length + (ordered ? `${m[2]}${m[3]} `.length : 2)
    i++
    while (i < lines.length) {
      const next = lines[i]!
      if (next.trim() === '') {
        // A blank line ends the item unless the next line is indented under it.
        const after = lines[i + 1]
        if (after !== undefined && after.trim() !== '' && after.length - after.trimStart().length >= contentIndent) {
          body.push('')
          i++
          continue
        }
        break
      }
      const indent = next.length - next.trimStart().length
      if (indent >= contentIndent || (indent > base && !BULLET.test(next) && !NUMBER.test(next))) {
        body.push(next.slice(Math.min(indent, contentIndent)))
        i++
        continue
      }
      if (indent > base) {
        body.push(next.slice(Math.min(indent, contentIndent)))
        i++
        continue
      }
      break
    }
    items.push({ marker, task, blocks: parseBlocks(body.join('\n')) })
    // Loose lists keep a blank line between items; skip it and continue the same list.
    if (i < lines.length && lines[i]!.trim() === '') {
      const after = lines[i + 1]
      const again = after?.match(ordered ? NUMBER : BULLET)
      if (again && again[1]!.length === base) {
        i++
        continue
      }
    }
  }
  return { block: { kind: 'list', ordered, items }, next: i }
}
