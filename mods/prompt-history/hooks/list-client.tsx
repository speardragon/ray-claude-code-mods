// The prompt list, drawn by a surface module: the row under the pointer takes a quiet background,
// a click posts the one to pick (the preview follows it) and jump to; keys go along.
import type { ClientModule } from 'claude-code'

export type ListRow =
  | { kind: 'day'; label: string }
  | { kind: 'prompt'; uuid: string; no: string; text: string; time: string; isSelected: boolean }

export type ListProps = {
  width: number
  rows: ListRow[]
  colors: { bg: string; hover: string; pressed: string; selected: string; accent: string; fg: string; muted: string; subtle: string }
}

export type ListMessage = { pick: string } | { press: string }

type State = { hover: number | null; down: number | null }

const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x20 || (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return n
    const isWide =
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
    return n + (isWide ? 2 : 1)
  }, 0)

// `s` cut to `width` cells, an ellipsis standing for what was cut.
function fit(s: string, width: number) {
  if (cells(s) <= width) return s
  let out = ''
  for (const ch of s) {
    if (cells(out + ch) > width - 1) break
    out += ch
  }
  return `${out}…`
}

const PromptList: ClientModule<ListProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: null, down: null }
  const c = props.colors
  const uuidAt = (i: number | null) => {
    const row = i === null ? undefined : props.rows[i]
    return row?.kind === 'prompt' ? row.uuid : null
  }
  const rowAt = (x: number, y: number) =>
    y >= 0 && y < props.rows.length && x >= 0 && x < props.width && props.rows[y]!.kind === 'prompt' ? y : null
  const set = (next: State) => {
    if (next.hover !== state.hover || next.down !== state.down) surface.setState(next)
  }

  surface.onPointer(event => {
    const at = rowAt(event.x, event.y)
    if (event.type === 'leave') set({ hover: null, down: null })
    else if (event.type === 'move' || event.type === 'enter') set({ ...state, hover: at })
    else if (event.type === 'down' && event.button === 'left') set({ hover: at, down: at })
    else if (event.type === 'up' && event.button === 'left') {
      const uuid = at !== null && at === state.down ? uuidAt(at) : null
      set({ hover: at, down: null })
      if (uuid) surface.post({ pick: uuid } satisfies ListMessage)
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies ListMessage)
  })

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, i) => {
        if (row.kind === 'day') {
          const head = ` ${row.label} `
          return (
            <Text backgroundColor={c.bg} wrap="truncate-end">
              <Text color={c.subtle}>{'──'}</Text>
              <Text color={c.muted} weight="bold">
                {head}
              </Text>
              <Text color={c.subtle}>{'─'.repeat(Math.max(0, props.width - 2 - cells(head)))}</Text>
            </Text>
          )
        }
        const bg = row.isSelected ? c.selected : state.down === i ? c.pressed : state.hover === i ? c.hover : c.bg
        // The time always shows whole: the text gets what the marker, number, time and gaps leave.
        const fixed = 1 + cells(row.no) + 2 + 1 + 1 + cells(row.time) + 1 // ▎, no, ' ❯', ' ', gap, time, ' '
        const text = fit(row.text, Math.max(1, props.width - fixed))
        const used = fixed - 1 + cells(text)
        return (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={c.accent}>{row.isSelected ? '▎' : ' '}</Text>
            <Text color={c.subtle}>{row.no}</Text>
            <Text color={row.isSelected ? c.accent : c.subtle}>{' ❯'}</Text>
            <Text color={row.isSelected || state.hover === i ? c.fg : '#c9d1d9'}>{' ' + text}</Text>
            <Text>{' '.repeat(Math.max(1, props.width - used))}</Text>
            <Text color={c.muted}>{row.time}</Text>
            <Text> </Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default PromptList
