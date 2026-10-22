// The explorer's rows, drawn by a surface module so the row under the pointer takes a quiet
// background of its own (a Button would invert), and a click posts which row to the hooks module.
import type { ClientModule } from 'claude-code'

export type TreeItem = {
  key: string
  kind: 'dir' | 'file'
  lead: string // indent and chevron
  glyph: string
  glyphColor: string
  name: string // already cut to fit
  nameColor: string
  status: string // ' M ' and the like; empty for a folder
  statusColor: string
  isSelected: boolean
  isStruck: boolean
}

export type TreeProps = {
  width: number
  rows: TreeItem[]
  colors: { bg: string; hover: string; selected: string; accent: string }
}

// A click on a row, or a key pressed while the explorer holds the focus.
export type TreeMessage = { type: 'pick' | 'toggle'; key: string } | { press: string }

type State = { hover: number | null }

const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const isWide = (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)
    return n + (isWide ? 2 : 1)
  }, 0)

const ExplorerRows: ClientModule<TreeProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? null

  surface.onPointer(event => {
    const row = event.y >= 0 && event.y < props.rows.length && event.x >= 0 && event.x < props.width ? event.y : null
    if (event.type === 'leave') {
      if (hover !== null) surface.setState({ hover: null })
      return
    }
    if (event.type === 'move' || event.type === 'enter') {
      if (row !== hover) surface.setState({ hover: row })
      return
    }
    if (event.type === 'up' && event.button === 'left' && row !== null) {
      const item = props.rows[row]!
      const message: TreeMessage = { type: item.kind === 'dir' ? 'toggle' : 'pick', key: item.key }
      surface.post(message)
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies TreeMessage)
  })

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((item, i) => {
        const bg = item.isSelected ? props.colors.selected : i === hover ? props.colors.hover : props.colors.bg
        const used = cells(item.lead) + 1 + cells(item.name) + 1 + cells(item.status)
        return (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={props.colors.accent}>{item.isSelected ? '▎' : ' '}</Text>
            <Text color={item.kind === 'dir' ? '#7d8590' : props.colors.accent}>{item.lead.slice(1)}</Text>
            <Text color={item.glyphColor}>{item.glyph}</Text>
            <Text color={item.nameColor} strikethrough={item.isStruck}>
              {' ' + item.name}
            </Text>
            <Text>{' '.repeat(Math.max(1, props.width - used))}</Text>
            <Text color={item.statusColor}>{item.status}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default ExplorerRows
