// The preview's rows in diff view: each diff line wrapped (or cut) to the room right of its gutter,
// painted in GitHub's diff colors, the changed part of a paired line marked.
import type { Elements } from 'claude-code'

import type { Diff } from './diff'
import { expandTabs, pad, padStart, segsWidth, sliceSegs, textWidth, truncate, wrapSegs } from './text'
import type { Seg } from './text'
import { C } from './theme'

type Els = Pick<Elements['terminal'], 'Text'>

// One row of the preview: a diff line (or its wrapped continuation), a hunk header, or a note.
export type VRow =
  | { kind: 'line'; type: 'eq' | 'add' | 'del'; nums: string; marker: string; segs: Seg[] }
  | { kind: 'hunk'; text: string }
  | { kind: 'note'; text: string; color: string }

const TAB = 4


// Tabs expanded across segments with one running column, so tab stops stay where they were.
function expandSegs(segs: Seg[]): Seg[] {
  let col = 0
  return segs.map(seg => {
    let text = ''
    for (const ch of seg.text) {
      if (ch === '\t') {
        const n = TAB - (col % TAB)
        text += ' '.repeat(n)
        col += n
      } else {
        const one = expandTabs(ch)
        text += one
        col += textWidth(one)
      }
    }
    return { text, isMarked: seg.isMarked }
  })
}

function segsOf(text: string, mark?: [number, number]): Seg[] {
  if (!mark) return expandSegs([{ text, isMarked: false }])
  const [lo, hi] = mark
  return expandSegs(
    [
      { text: text.slice(0, lo), isMarked: false },
      { text: text.slice(lo, hi), isMarked: true },
      { text: text.slice(hi), isMarked: false },
    ].filter(s => s.text !== ''),
  )
}

// The diff as rows `width` cells wide: each line wrapped to the room right of its gutter, or whole
// (one row each) for the window to show a sideways slice of.
export function diffRows(diff: Diff, width: number, isWrapped: boolean): VRow[] {
  const maxNo = diff.rows.reduce((n, r) => (r.kind === 'hunk' ? n : Math.max(n, r.oldNo ?? 0, r.newNo ?? 0)), 0)
  const gw = Math.max(2, String(maxNo).length)
  const gutter = gw * 2 + 2
  const room = Math.max(4, width - gutter - 2)
  const out: VRow[] = []
  for (const row of diff.rows) {
    if (row.kind === 'hunk') {
      const head = `@@ -${row.oldStart},${row.oldLines} +${row.newStart},${row.newLines} @@`
      const skipped = row.skipped > 0 ? `   ⋯ ${row.skipped} unchanged line${row.skipped === 1 ? '' : 's'}` : ''
      out.push({ kind: 'hunk', text: head + skipped })
      continue
    }
    const nums = `${padStart(row.oldNo ? String(row.oldNo) : '', gw)} ${padStart(row.newNo ? String(row.newNo) : '', gw)} `
    const marker = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
    const segs = segsOf(row.text, row.mark)
    const parts = isWrapped ? wrapSegs(segs, room) : [segs]
    parts.forEach((part, i) => {
      out.push({ kind: 'line', type: row.kind, nums: i === 0 ? nums : ' '.repeat(gutter), marker: i === 0 ? marker : ' ', segs: part })
    })
  }
  return out
}

// The widest line's cells, right of the gutter: how far the window can scroll sideways.
export const contentWidth = (rows: VRow[]) =>
  rows.reduce((n, row) => (row.kind === 'line' ? Math.max(n, segsWidth(row.segs)) : n), 0)

// The room right of the gutter a line row has in `width` cells.
export const lineRoom = (rows: VRow[], width: number) => {
  const line = rows.find(row => row.kind === 'line')
  return line && line.kind === 'line' ? Math.max(4, width - textWidth(line.nums) - 2) : width
}

// One row, the window `x` cells into its line; a hunk header and a note never move.
export function PreviewRow({ els, row, width, x = 0 }: { els: Els; row: VRow; width: number; x?: number }) {
  const { Text } = els
  if (row.kind === 'hunk') {
    return (
      <Text backgroundColor={C.hunkLine} color={C.hunkFg} wrap="truncate-end">
        {pad(truncate(` ${row.text}`, width), width)}
      </Text>
    )
  }
  if (row.kind === 'note') {
    return (
      <Text backgroundColor={C.canvas} color={row.color} wrap="truncate-end">
        {pad(truncate(row.text, width), width)}
      </Text>
    )
  }
  const lineBg = row.type === 'add' ? C.addLine : row.type === 'del' ? C.delLine : C.canvas
  const numBg = row.type === 'add' ? C.addNum : row.type === 'del' ? C.delNum : C.canvas
  const wordBg = row.type === 'add' ? C.addWord : C.delWord
  const markerFg = row.type === 'add' ? C.addFg : row.type === 'del' ? C.delFg : C.muted
  const numFg = row.type === 'eq' ? C.subtle : C.muted
  const room = Math.max(0, width - textWidth(row.nums) - 2)
  const segs = sliceSegs(row.segs, x, room)
  const used = textWidth(row.nums) + 2 + segsWidth(segs)
  return (
    <Text wrap="truncate-end">
      <Text backgroundColor={numBg} color={numFg}>
        {row.nums}
      </Text>
      <Text backgroundColor={lineBg} color={markerFg}>
        {row.marker + ' '}
      </Text>
      {segs.map(seg => (
        <Text backgroundColor={seg.isMarked ? wordBg : lineBg} color={C.fg}>
          {seg.text}
        </Text>
      ))}
      <Text backgroundColor={lineBg}>{' '.repeat(Math.max(0, width - used))}</Text>
    </Text>
  )
}

