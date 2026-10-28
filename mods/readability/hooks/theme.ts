// Colors for replies on a dark terminal: GitHub's dark palette, with text a step softer than white so
// emphasis and code stand out from it rather than shouting over it.

export type Paint = {
  color?: string
  backgroundColor?: string
  weight?: 'bold'
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

export const T = {
  text: '#f0f6fc',
  strong: '#ffffff',
  muted: '#8b949e',
  subtle: '#484f58',
  link: '#58a6ff',
  code: '#ffa657',
  codeBg: '#1c2128',
  blockBg: '#161b22',
  rule: '#8b949e',
  box: '#6e7681', // a code block's frame
  quoteBar: '#58a6ff', // a quote's bar, and its tinted lines
  quoteText: '#d1d7e0',
  quoteBg: '#131a24',
  bullet: ['#79c0ff', '#d2a8ff', '#7ee787'],
  number: '#79c0ff',
  done: '#3fb950',
  heading: ['#f0f6fc', '#79c0ff', '#d2a8ff', '#ffa657', '#7ee787', '#8b949e'],
  syntax: {
    plain: '#c9d1d9',
    comment: '#8b949e',
    string: '#a5d6ff',
    number: '#79c0ff',
    keyword: '#ff7b72',
    type: '#ffa657',
    call: '#d2a8ff',
    punct: '#8b949e',
    key: '#7ee787',
  },
  tableBorder: '#8b949e',
  tableHead: '#ffffff',
  tableHeadBg: '#264166', // the header row's cells, so it reads apart from the body
} as const
