// Colors and marks. Labels and separators use theme keys, so they follow a light or dark theme;
// the bars use fixed colors that read on both.

export type Paint = { color?: string; backgroundColor?: string; dimColor?: boolean; weight?: 'bold'; underline?: boolean }

// A run of text; one with an `href` is drawn as a button that opens the address.
export type Span = { text: string; paint?: Paint; href?: string }

export const span = (text: string, paint?: Paint, href?: string): Span => ({
  text,
  ...(paint ? { paint } : {}),
  ...(href ? { href } : {}),
})

export const T = {
  brand: 'claude',
  // Words and figures: the theme's own text color, white on a dark theme and black on a light one.
  label: 'text',
  // What is grey by meaning: the details beside a bar, an effort not reached, an idle value.
  muted: 'inactive',
  faint: 'subtle',
  // The empty cells of a bar: a dark block, so the bar keeps its length when nearly empty.
  track: 'subtle',
  path: '#7fa7c9',
  branch: 'text',
  commit: 'green',
  gitStatus: 'yellow',
  merged: 'merged',
  // Each meter's own color: its dot and its bar.
  // - mid-tone and a little greyed, so the bars sit calmly on a dark or a light theme
  meter: {
    context: '#5fa8a3',
    fiveHour: '#7189c4',
    sevenDay: '#9a82c2',
    fable: '#cf7a5b', // terracotta: Fable's own meter stands apart from the cool others
  },
  // The figure turns to these as what is left runs down; the bar keeps its meter's color.
  status: {
    good: 'text',
    warning: '#d6b36a',
    serious: '#d98c66',
    critical: '#d9665f',
  },
  effort: {
    low: '#d6b36a',
    medium: '#8db58a',
    high: '#7ea3cc',
    xhigh: '#9a82c2',
    max: '#cf7a5b',
  } as Readonly<Record<string, string>>,
  mode: {
    acceptEdits: '#9a82c2',
    plan: '#5fa8a3',
    auto: '#d6b36a',
    bypassPermissions: '#d9665f',
  } as Readonly<Record<string, string>>,
  active: '#8db58a',
  filled: '█',
  // Left eighths of a cell, for the cell the fill ends in.
  eighths: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
  // Cells per effort step: a cell is about twice as tall as wide, so two make a square.
  effortStepCells: 2,
  dot: '●',
  divider: '│',
  // On the fill or the track as background, so a bar or effort's squares run on unbroken.
  tick: '│', // between a bar's segments: a box line, thinner than any block; terminals draw it full height
  barTick: '#d0d7de',
  effortTick: '▎', // between effort's steps: a quarter, as a darker groove reads thinner
  trackGroove: '#2d333b', // the track is a theme key with no value to darken, so its groove is fixed
  separator: '·',
} as const

// A hex color mixed toward black, for the groove between effort's steps; a theme key has no value here to darken.
export function grooveOf(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (hex === undefined) return T.trackGroove
  const value = Number.parseInt(hex, 16)
  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) * GROOVE_DEPTH)
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

const GROOVE_DEPTH = 0.6

export type Status = keyof typeof T.status

// The step a figure is colored by, from what is left: half, a quarter, a tenth.
export function statusOf(remaining: number): Status {
  if (remaining <= 10) return 'critical'
  if (remaining <= 25) return 'serious'
  if (remaining <= 50) return 'warning'
  return 'good'
}
