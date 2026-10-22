// GitHub's dark theme (Primer dark default). Translucent diff colors are flattened onto the canvas,
// since a terminal cell takes one solid color.
export const C = {
  canvas: '#0d1117',
  sidebar: '#010409',
  border: '#30363d',
  fg: '#e6edf3',
  muted: '#7d8590',
  subtle: '#484f58',
  accent: '#2f81f7',
  selected: '#21262d', // a row picked in the explorer, beside the accent bar
  hover: '#161b22', // the row under the pointer
  segment: '#1c3a5e', // the active half of the Diff | File switch
  header: '#161b22',
  controlHover: '#262c36', // a control under the pointer
  controlPressed: '#30363d', // a control while pressed
  track: '#21262d', // a scrollbar's rail
  thumb: '#484f58', // its thumb at rest
  thumbActive: '#8b949e', // under the pointer or dragged

  addLine: '#12261e',
  addNum: '#1c4428',
  addWord: '#1f6034',
  addFg: '#3fb950',
  delLine: '#25171c',
  delNum: '#542426',
  delWord: '#7d2a2e',
  delFg: '#f85149',
  hunkLine: '#111d2e',
  hunkFg: '#8b949e',

  // VS Code's git decorations, for names in the tree.
  gitModified: '#e2c08d',
  gitAdded: '#73c991',
  gitDeleted: '#c74e39',
} as const
