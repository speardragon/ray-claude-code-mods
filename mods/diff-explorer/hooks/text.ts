// Terminal cell widths: Hangul, CJK and most emoji take two cells, combining marks none.
// Rows are padded to the column's width so their background fills it, so widths must be right.

const WIDE: [number, number][] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, punctuation
  [0x3041, 0x33ff], // kana, Hangul compatibility jamo, CJK symbols
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], // emoji
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd], // CJK extensions B and later
]

const ZERO: [number, number][] = [
  [0x0300, 0x036f], // combining diacritics
  [0x200b, 0x200f], // zero-width space, joiners, marks
  [0xfe00, 0xfe0f], // variation selectors
  [0x1160, 0x11ff], // Hangul medial and final jamo
]

const within = (cp: number, ranges: [number, number][]) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi)

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (within(cp, ZERO)) return 0
  return within(cp, WIDE) ? 2 : 1
}

export const textWidth = (s: string) => [...s].reduce((n, ch) => n + charWidth(ch), 0)

// Tabs to spaces at `size` stops, and every other control character dropped.
export function expandTabs(s: string, size = 4): string {
  let out = ''
  let col = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (ch === '\t') {
      const n = size - (col % size)
      out += ' '.repeat(n)
      col += n
    } else if (cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0)) {
      out += ch
      col += charWidth(ch)
    }
  }
  return out
}

export const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - textWidth(s)))

export const padStart = (s: string, width: number) => ' '.repeat(Math.max(0, width - textWidth(s))) + s

// Cut to `width` cells, an ellipsis standing for what was cut.
export function truncate(s: string, width: number): string {
  if (width <= 0) return ''
  if (textWidth(s) <= width) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const w = charWidth(ch)
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return out + '…'
}

// Cut from the left, keeping the end (a path's file name).
export function truncateStart(s: string, width: number): string {
  if (width <= 0) return ''
  if (textWidth(s) <= width) return s
  const chars = [...s]
  let out = ''
  let used = 0
  for (let i = chars.length - 1; i >= 0; i--) {
    const w = charWidth(chars[i]!)
    if (used + w > width - 1) break
    out = chars[i] + out
    used += w
  }
  return '…' + out
}

// A run of text, marked when it is the changed part of a line.
export type Seg = { text: string; isMarked: boolean }

// Lays segments out in rows of at most `width` cells, splitting a segment where a row ends.
export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  const rows: Seg[][] = [[]]
  let used = 0
  for (const seg of segs) {
    let run = ''
    for (const ch of seg.text) {
      const w = charWidth(ch)
      if (used + w > width && used > 0) {
        if (run) rows[rows.length - 1]!.push({ text: run, isMarked: seg.isMarked })
        rows.push([])
        run = ''
        used = 0
      }
      run += ch
      used += w
    }
    if (run) rows[rows.length - 1]!.push({ text: run, isMarked: seg.isMarked })
  }
  return rows
}

export const segsWidth = (segs: Seg[]) => segs.reduce((n, s) => n + textWidth(s.text), 0)

// The cells [from, from + width) of a row of segments: what a window scrolled sideways shows.
// A wide character cut by either edge becomes a space, so the columns stay where they were.
export function sliceSegs(segs: Seg[], from: number, width: number): Seg[] {
  const out: Seg[] = []
  let col = 0
  const end = from + width
  for (const seg of segs) {
    let text = ''
    for (const ch of seg.text) {
      const w = charWidth(ch)
      const next = col + w
      if (col >= from && next <= end) text += ch
      else if (next > from && col < end) text += ' '.repeat(Math.min(next, end) - Math.max(col, from))
      col = next
      if (col >= end) break
    }
    if (text) out.push({ text, isMarked: seg.isMarked })
    if (col >= end) break
  }
  return out
}

// A line with its first `n` cells dropped.
export const dropCells = (s: string, n: number) =>
  n <= 0 ? s : sliceSegs([{ text: s, isMarked: false }], n, Number.MAX_SAFE_INTEGER).map(seg => seg.text).join('')
