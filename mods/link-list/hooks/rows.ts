// The list as rows a fixed number of cells wide, every column at the same cell in every row:
//   [n]  ▣  the link's words …                host.dev
// The number and favicon columns (the lead) are drawn by the pane, where an Image can sit; the
// words and host (the body) by the list's surface module. A group's header row spans both.
import type { Group, Locale } from '../types'
import { hostOf, keyOf, labelOf } from './collect'
import { textWidth, truncate } from './text'

export type LinkRow = { kind: 'link'; key: string; url: string; no: string; host: string; label: string; isSelected: boolean }
export type HeadRow = { kind: 'head'; label: string }
export type GapRow = { kind: 'gap' }
export type Row = LinkRow | HeadRow | GapRow

export type Columns = {
  lead: number // ` [n] ▣ `: a cell, the number right-aligned, a cell, the favicon's two, a cell
  numberWidth: number // `[12]`
  body: number // the words, two cells, the host, a cell; the scrollbar's cell is beside it
  hostWidth: number // 0 when the pane is too narrow for hosts
}

export const CHIP = 2 // a favicon: two cells wide and one tall, a square
const HOST_MAX = 24
const NARROW = 56 // narrower panes drop the host column

export function columnsOf(groups: Group[], width: number): Columns {
  const most = Math.max(1, ...groups.flatMap(g => g.links.map(l => l.no)))
  const numberWidth = String(most).length + 2
  const lead = 1 + numberWidth + 1 + CHIP + 1
  const longest = Math.max(0, ...groups.flatMap(g => g.links.map(l => textWidth(hostOf(l.url)))))
  const hostWidth = width < NARROW ? 0 : Math.min(HOST_MAX, longest)
  return { lead, numberWidth, body: Math.max(8, width - lead - 1), hostWidth }
}

const T = {
  ko: { reply: (n: number) => `답변 #${n}`, links: (n: number) => `링크 ${n}개` },
  en: { reply: (n: number) => `reply #${n}`, links: (n: number) => `${n} link${n === 1 ? '' : 's'}` },
} as const

// Newest reply first; `ago` says how long ago a group was kept ("3분 전").
export function rowsOf(groups: Group[], picked: string | null, locale: Locale, ago: (at: number) => string): Row[] {
  const t = T[locale]
  return [...groups]
    .map((group, i) => ({ group, replyNo: i + 1 }))
    .reverse()
    .flatMap(({ group, replyNo }, i): Row[] => [
      ...(i > 0 ? [{ kind: 'gap' as const }] : []),
      { kind: 'head', label: `${ago(group.at)} · ${t.reply(replyNo)} · ${t.links(group.links.length)}` },
      // A blank row between a reply's links, so a reply with several does not read as one block.
      ...group.links.flatMap((link, k): Row[] => [
        ...(k > 0 ? [{ kind: 'gap' as const }] : []),
        {
          kind: 'link',
          key: keyOf(group, link),
          url: link.url,
          no: `[${link.no}]`,
          host: hostOf(link.url),
          label: labelOf(link).replace(/\s+/g, ' '),
          isSelected: keyOf(group, link) === picked,
        },
      ]),
    ])
}

// A link row's body as text cut to fit: the words, padded, then the host right-aligned in its column.
export function bodyOf(row: LinkRow, columns: Columns): { words: string; gap: string; host: string } {
  const hostPart = columns.hostWidth > 0 ? 2 + columns.hostWidth : 0
  const room = Math.max(1, columns.body - hostPart - 1)
  const words = truncate(row.label, room)
  const host = columns.hostWidth > 0 ? truncate(row.host, columns.hostWidth) : ''
  const gap = ' '.repeat(Math.max(0, columns.body - 1 - textWidth(words) - textWidth(host)))
  return { words, gap, host: `${host} ` }
}

// The lead's number cell: right-aligned in its column, a cell either side.
export const numberCell = (no: string, columns: Columns) => ` ${no.padStart(columns.numberWidth)} `
