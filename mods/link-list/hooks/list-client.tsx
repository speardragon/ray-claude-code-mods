// The list's words and hosts, drawn by a surface module: the row under the pointer lights, a click
// posts the link to open, and keys go along. Every row arrives cut and padded to the width, so this
// draws them as they are.
import type { ClientModule } from 'claude-code'

export type ClientRow =
  | { kind: 'gap' }
  | { kind: 'head'; label: string; rule: string }
  | { kind: 'link'; key: string; words: string; gap: string; host: string; isSelected: boolean }

export type ListProps = {
  width: number
  rows: ClientRow[]
  colors: { bg: string; hover: string; pressed: string; selected: string; fg: string; text: string; muted: string; subtle: string; host: string; link: string }
}

export type ListMessage = { open: string } | { press: string }

type State = { hover: number | null; down: number | null }

const LinkList: ClientModule<ListProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: null, down: null }
  const c = props.colors
  const rowAt = (x: number, y: number) => (y >= 0 && y < props.rows.length && x >= 0 && x < props.width && props.rows[y]!.kind === 'link' ? y : null)
  const set = (next: State) => {
    if (next.hover !== state.hover || next.down !== state.down) surface.setState(next)
  }

  surface.onPointer(event => {
    const at = rowAt(event.x, event.y)
    if (event.type === 'leave') set({ hover: null, down: null })
    else if (event.type === 'move' || event.type === 'enter') set({ ...state, hover: at })
    else if (event.type === 'down' && event.button === 'left') set({ hover: at, down: at })
    else if (event.type === 'up' && event.button === 'left') {
      const row = at !== null && at === state.down ? props.rows[at] : undefined
      set({ hover: at, down: null })
      if (row?.kind === 'link') surface.post({ open: row.key } satisfies ListMessage)
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies ListMessage)
  })

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, i) => {
        if (row.kind === 'gap') return <Text backgroundColor={c.bg}>{' '.repeat(props.width)}</Text>
        if (row.kind === 'head') {
          return (
            <Text backgroundColor={c.bg} wrap="truncate-end">
              <Text color={c.muted} weight="bold">
                {row.label}
              </Text>
              <Text color={c.subtle}>{row.rule}</Text>
            </Text>
          )
        }
        const isLit = state.hover === i || state.down === i
        const bg = row.isSelected ? c.selected : state.down === i ? c.pressed : isLit ? c.hover : c.bg
        return (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={row.isSelected || isLit ? c.fg : c.text} underline={isLit}>
              {row.words}
            </Text>
            <Text>{row.gap}</Text>
            <Text color={isLit ? c.link : c.host}>{row.host}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default LinkList
