// A README as plain rows the detail column can window and scroll: headings, bullets, quotes and
// code kept apart by style, inline markup reduced to its text, HTML tags and images dropped.
import { wrapText } from './text'

export type MdStyle = 'h1' | 'h2' | 'h3' | 'text' | 'bullet' | 'quote' | 'code' | 'rule' | 'blank'
export type MdRow = { style: MdStyle; text: string }

export const inline = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trimEnd()

export function mdRows(markdown: string, width: number): MdRow[] {
  const rows: MdRow[] = []
  let inCode = false
  const push = (style: MdStyle, text: string, indent = '') => {
    const room = Math.max(8, width - indent.length)
    wrapText(text, room).forEach((part, i) => rows.push({ style, text: (i === 0 ? indent : ' '.repeat(indent.length)) + part }))
  }
  for (const raw of markdown.split('\n')) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode
      continue
    }
    if (inCode) {
      rows.push({ style: 'code', text: raw.replace(/\t/g, '    ') })
      continue
    }
    const line = inline(raw)
    const heading = raw.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      if (rows.length > 0 && rows[rows.length - 1]!.style !== 'blank') rows.push({ style: 'blank', text: '' })
      const level = heading[1]!.length
      push(level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', inline(heading[2]!))
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(raw)) {
      rows.push({ style: 'rule', text: '' })
      continue
    }
    const bullet = raw.match(/^(\s*)[-*+]\s+(.*)$/) ?? raw.match(/^(\s*)\d+[.)]\s+(.*)$/)
    if (bullet) {
      push('bullet', inline(bullet[2]!), `${' '.repeat(bullet[1]!.length)}• `)
      continue
    }
    if (/^\s*>/.test(raw)) {
      push('quote', inline(raw.replace(/^\s*>\s?/, '')), '│ ')
      continue
    }
    if (line.trim() === '') {
      if (rows.length > 0 && rows[rows.length - 1]!.style !== 'blank') rows.push({ style: 'blank', text: '' })
      continue
    }
    push('text', line)
  }
  while (rows.length > 0 && rows[rows.length - 1]!.style === 'blank') rows.pop()
  return rows
}
