// The installed plugins, drawn by a surface module: the row under the pointer takes a quiet
// background, a click on a row posts it as picked, a click on its switch posts a toggle.
import type { ClientModule } from 'claude-code'

export type ListRow =
  | { kind: 'group'; label: string }
  | {
      kind: 'mod'
      id: string
      name: string // already cut to fit
      version: string
      isOn: boolean
      lock: '' | 'dev' | 'self' // a session mod or this manager: no switch
      tag: string // 'plugin' for a plugin with no hooks module, shown under the All filter
      isSelected: boolean
    }

export type ListProps = {
  width: number
  rows: ListRow[]
  colors: {
    bg: string
    hover: string
    pressed: string
    selected: string
    accent: string
    fg: string
    muted: string
    subtle: string
    on: string
    onBg: string
    offBg: string
  }
}

export type ListMessage = { pick: string } | { toggle: string } | { press: string }

export const SWITCH = 6 // the switch's cells at the row's end, its trailing space included

type State = { hover: number | null; down: number | null }

const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const isWide = (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xff00 && cp <= 0xff60)
    return n + (isWide ? 2 : 1)
  }, 0)

const ModList: ClientModule<ListProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: null, down: null }
  const c = props.colors
  const modAt = (x: number, y: number) => {
    const row = y >= 0 && x >= 0 && x < props.width ? props.rows[y] : undefined
    return row?.kind === 'mod' ? y : null
  }
  const set = (next: State) => {
    if (next.hover !== state.hover || next.down !== state.down) surface.setState(next)
  }

  surface.onPointer(event => {
    const at = modAt(event.x, event.y)
    if (event.type === 'leave') set({ hover: null, down: null })
    else if (event.type === 'move' || event.type === 'enter') set({ ...state, hover: at })
    else if (event.type === 'down' && event.button === 'left') set({ hover: at, down: at })
    else if (event.type === 'up' && event.button === 'left') {
      const row = at !== null && at === state.down ? props.rows[at] : undefined
      set({ hover: at, down: null })
      if (row?.kind !== 'mod') return
      const onSwitch = event.x >= props.width - SWITCH
      surface.post(onSwitch && !row.lock ? ({ toggle: row.id } satisfies ListMessage) : ({ pick: row.id } satisfies ListMessage))
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies ListMessage)
  })

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, i) => {
        if (row.kind === 'group') {
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
        const tag = row.tag ? ` ${row.tag}` : ''
        const used = 1 + 3 + cells(row.name) + 1 + cells(row.version) + cells(tag) + SWITCH
        const sw = row.lock
          ? { text: row.lock === 'dev' ? ' dev ' : ' this', color: c.subtle, bg }
          : row.isOn
            ? { text: '  ON ', color: c.on, bg: c.onBg }
            : { text: ' OFF ', color: c.muted, bg: c.offBg }
        return (
          <Text backgroundColor={bg} wrap="truncate-end">
            <Text color={c.accent}>{row.isSelected ? '▎' : ' '}</Text>
            <Text color={row.isOn ? c.on : c.subtle}>{row.isOn ? ' ● ' : ' ○ '}</Text>
            <Text color={row.isOn ? c.fg : c.muted} weight={row.isSelected ? 'bold' : undefined}>
              {row.name}
            </Text>
            <Text color={c.subtle}>{` ${row.version}`}</Text>
            <Text>{' '.repeat(Math.max(1, props.width - used))}</Text>
            <Text color={c.subtle}>{tag}</Text>
            <Text color={sw.color} backgroundColor={sw.bg} weight="bold">
              {sw.text}
            </Text>
            <Text> </Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default ModList
