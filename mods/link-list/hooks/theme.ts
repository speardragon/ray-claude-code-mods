// GitHub's dark theme (Primer dark default), as the other panes here use it.
export const C = {
  canvas: '#0d1117',
  border: '#30363d',
  fg: '#e6edf3',
  text: '#c9d1d9', // a link's words
  muted: '#7d8590',
  subtle: '#484f58',
  accent: '#2f81f7',
  number: '#79c0ff', // a link's [n], the blue readability's superscripts take
  host: '#6e7681',
  selected: '#1f2a3a', // the picked link
  hover: '#161b22', // the row under the pointer
  pressed: '#262c36', // a row while pressed
  header: '#161b22',
  controlHover: '#262c36',
  controlPressed: '#30363d',
  track: '#21262d',
  thumb: '#484f58',
  thumbActive: '#8b949e',
  badgeFg: '#0d1117', // a letter badge's letter, on its color
  chip: '#d0d7de', // behind a favicon: most are drawn for a light browser tab, and a dark one vanishes on the canvas
  warn: '#d29922',
  ok: '#3fb950',
} as const
