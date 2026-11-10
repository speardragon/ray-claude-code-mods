// Colors and marks. Labels and separators use theme keys, so they follow a light or dark theme;
// the bars use fixed status colors that read on both.

export type Paint = { color?: string; dimColor?: boolean; weight?: 'bold'; underline?: boolean }

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
  // What is grey by meaning: a draft pull request, the dots of an effort not reached, an empty meter.
  muted: 'inactive',
  faint: 'subtle',
  path: '#57c7ff',
  branch: 'text',
  commit: 'green',
  gitStatus: 'yellow',
  merged: 'merged',
  fable: '#e8501e', // a deep orange, close to red: Fable's own meter stands apart from the others
  status: {
    good: '#3fb950',
    warning: '#d29922',
    serious: '#ec835a',
    critical: '#f85149',
  },
  effort: {
    low: 'warning',
    medium: 'success',
    high: 'permission',
    xhigh: 'autoAccept',
    max: 'claude',
  } as Readonly<Record<string, string>>,
  filled: '━',
  track: '─',
  effortOn: '●',
  effortOff: '○',
  separator: '·',
  reset: '↻',
  mark: '✻',
} as const

export type Status = keyof typeof T.status

// The step a bar is colored by, from what is left: half, a quarter, a tenth.
export function statusOf(remaining: number): Status {
  if (remaining <= 10) return 'critical'
  if (remaining <= 25) return 'serious'
  if (remaining <= 50) return 'warning'
  return 'good'
}
