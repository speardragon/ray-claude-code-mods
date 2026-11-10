// Terminal cell widths: Hangul, CJK and most emoji take two cells, combining marks none.
// The rows are fitted to the terminal's width, so widths must be right.

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, punctuation
  [0x3041, 0x33ff], // kana, Hangul compatibility jamo, CJK symbols
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], // emoji
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd], // CJK extensions B and later
]

const ZERO: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // combining diacritics
  [0x200b, 0x200f], // zero-width space, joiners, marks
  [0xfe00, 0xfe0f], // variation selectors
]

const within = (cp: number, ranges: readonly (readonly [number, number])[]) =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi)

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (within(cp, ZERO)) return 0
  return within(cp, WIDE) ? 2 : 1
}

export const textWidth = (s: string) => [...s].reduce((n, ch) => n + charWidth(ch), 0)

// Cut to `width` cells, the last one an ellipsis.
export function truncate(s: string, width: number): string {
  if (textWidth(s) <= width) return s
  if (width < 1) return ''
  const kept = [...s].reduce(
    (acc, ch) => (acc.isFull || acc.width + charWidth(ch) > width - 1 ? { ...acc, isFull: true } : { text: acc.text + ch, width: acc.width + charWidth(ch), isFull: false }),
    { text: '', width: 0, isFull: false },
  )
  return `${kept.text}…`
}

// Cut to `width` cells from the start, the first one an ellipsis: the end of a path is kept.
export function truncateStart(s: string, width: number): string {
  if (textWidth(s) <= width) return s
  if (width < 1) return ''
  const kept = [...s].reduceRight(
    (acc, ch) => (acc.isFull || acc.width + charWidth(ch) > width - 1 ? { ...acc, isFull: true } : { text: ch + acc.text, width: acc.width + charWidth(ch), isFull: false }),
    { text: '', width: 0, isFull: false },
  )
  return `…${kept.text}`
}
