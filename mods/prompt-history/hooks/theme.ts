// GitHub's dark theme (Primer dark default), as diff-explorer uses it.
export const C = {
  canvas: '#0d1117',
  sidebar: '#010409',
  border: '#30363d',
  fg: '#e6edf3',
  text: '#c9d1d9', // a prompt's body
  muted: '#7d8590',
  subtle: '#484f58',
  accent: '#2f81f7',
  selected: '#21262d', // the picked prompt, beside the accent bar
  hover: '#161b22', // the row under the pointer
  pressed: '#262c36', // a row while pressed
  segment: '#1c3a5e', // the active half of a switch
  header: '#161b22',
  controlHover: '#262c36', // a control under the pointer
  controlPressed: '#30363d', // a control while pressed
  track: '#21262d', // a scrollbar's rail
  thumb: '#484f58', // its thumb at rest
  thumbActive: '#8b949e', // under the pointer or dragged
  warn: '#d29922', // a jump the engine refused
} as const
