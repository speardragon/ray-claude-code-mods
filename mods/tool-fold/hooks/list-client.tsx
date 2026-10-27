// The panel's list of calls, drawn by a surface module: the row under the pointer lights quietly and
// a click posts the call to show; the keys go along.
import type { ClientModule } from 'claude-code'

export type CallRow = {
  id: string
  glyph: string
  glyphColor: string
  tool: string
  toolColor: string
  subject: string // already cut to fit
  right: string
  rightColor: string
  isSelected: boolean
  isSub: boolean // a subagent's call, indented under it
}

export type CallListProps = {
  width: number
  rows: CallRow[]
  colors: { bg: string; hover: string; pressed: string; selected: string; accent: string; text: string; sub: string }
}

export type CallListMessage = { pick: string } | { press: string }

type State = { hover: number | null; down: number | null }

const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const isWide = (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xff00 && cp <= 0xff60) || /\p{Emoji_Presentation}/u.test(ch)
    return n + (isWide ? 2 : 1)
  }, 0)

const CallList: ClientModule<CallListProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: null, down: null }
  const c = props.colors
  const at = (x: number, y: number) => (y >= 0 && y < props.rows.length && x >= 0 && x < props.width ? y : null)
  const set = (next: State) => {
    if (next.hover !== state.hover || next.down !== state.down) surface.setState(next)
  }
  surface.onPointer(event => {
    const row = at(event.x, event.y)
    if (event.type === 'leave') set({ hover: null, down: null })
    else if (event.type === 'move' || event.type === 'enter') set({ ...state, hover: row })
    else if (event.type === 'down' && event.button === 'left') set({ hover: row, down: row })
    else if (event.type === 'up' && event.button === 'left') {
      const picked = row !== null && row === state.down ? props.rows[row] : undefined
      set({ hover: row, down: null })
      if (picked) surface.post({ pick: picked.id } satisfies CallListMessage)
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies CallListMessage)
  })
  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((r, i) => {
        const bg = r.isSelected ? c.selected : state.down === i ? c.pressed : state.hover === i ? c.hover : c.bg
        const lead = r.isSub ? '  └ ' : ' '
        const used = 1 + cells(lead) + 2 + cells(r.tool) + 1 + cells(r.subject) + cells(r.right) + 1
        return (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={c.accent}>{r.isSelected ? '▎' : ' '}</Text>
            <Text color={c.sub}>{lead.slice(1)}</Text>
            <Text color={r.glyphColor}>{r.glyph} </Text>
            <Text color={r.toolColor} weight="bold">
              {r.tool}
            </Text>
            <Text color={c.text}>{` ${r.subject}`}</Text>
            <Text>{' '.repeat(Math.max(1, props.width - used))}</Text>
            <Text color={r.rightColor}>{r.right}</Text>
            <Text> </Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default CallList
