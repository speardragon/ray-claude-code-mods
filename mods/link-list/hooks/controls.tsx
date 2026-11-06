// One row of the pane's chrome (the toolbar, a header, the status row), drawn by a surface module
// so a control under the pointer takes a quiet background (a Button would invert), a press darkens
// it, and a click posts its action. Once clicked, the row takes the pane's keys and posts those.
import type { ClientModule } from 'claude-code'

export type Part = { text: string; color?: string; bg?: string; bold?: boolean; strike?: boolean }

// A run of text, a control (with an `action`), or a spacer that takes the room left over.
export type Item = { parts: Part[]; action?: string; isOn?: boolean } | { spacer: true }

export type ControlsProps = {
  width: number
  bg: string
  items: Item[]
  colors: { hover: string; pressed: string; on: string; fg: string }
}

// A click on a control, or a key pressed while the row holds the focus.
export type ControlsMessage = { action: string } | { press: string }

type State = { hover: number | null; down: number | null }

export const cellsOf = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x20 || (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return n
    const isWide =
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
    return n + (isWide ? 2 : 1)
  }, 0)

const widthOf = (item: Item) => ('spacer' in item ? 0 : item.parts.reduce((n, p) => n + cellsOf(p.text), 0))

// Each item's [start, end) columns, the spacers sharing what the rest leave.
export function spans(items: Item[], width: number): [number, number][] {
  const fixed = items.reduce((n, item) => n + widthOf(item), 0)
  const spacers = items.filter(item => 'spacer' in item).length
  const spare = Math.max(0, width - fixed)
  let at = 0
  let given = 0
  return items.map(item => {
    let w = widthOf(item)
    if ('spacer' in item) {
      given++
      w = given === spacers ? spare - Math.floor(spare / spacers) * (spacers - 1) : Math.floor(spare / spacers)
    }
    const span: [number, number] = [at, at + w]
    at += w
    return span
  })
}

const ControlRow: ClientModule<ControlsProps, State> = (props, surface) => {
  const { Text } = surface.elements
  const state = surface.state ?? { hover: null, down: null }
  const layout = spans(props.items, props.width)
  const hit = (x: number, y: number) => {
    if (y !== 0) return null
    const i = layout.findIndex(([a, b]) => x >= a && x < b)
    const item = props.items[i]
    return item && !('spacer' in item) && item.action ? i : null
  }
  const set = (next: State) => {
    if (next.hover !== state.hover || next.down !== state.down) surface.setState(next)
  }

  surface.onPointer(event => {
    const at = hit(event.x, event.y)
    if (event.type === 'leave') set({ hover: null, down: null })
    else if (event.type === 'move' || event.type === 'enter') set({ ...state, hover: at })
    else if (event.type === 'down' && event.button === 'left') set({ hover: at, down: at })
    else if (event.type === 'up' && event.button === 'left') {
      const item = at !== null && at === state.down ? props.items[at] : undefined
      set({ hover: at, down: null })
      if (item && !('spacer' in item) && item.action) surface.post({ action: item.action } satisfies ControlsMessage)
    }
  })
  surface.onKey(event => {
    if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies ControlsMessage)
  })

  return (
    <Text backgroundColor={props.bg} wrap="truncate-end">
      {props.items.map((item, i) => {
        const [a, b] = layout[i]!
        if ('spacer' in item) return <Text backgroundColor={props.bg}>{' '.repeat(b - a)}</Text>
        const isActive = item.action !== undefined && (state.down === i || state.hover === i)
        const lit = state.down === i ? props.colors.pressed : props.colors.hover
        return (
          <Text>
            {item.parts.map(part => (
              <Text
                color={part.color ?? (item.isOn ? props.colors.on : props.colors.fg)}
                backgroundColor={isActive && !part.bg ? lit : (part.bg ?? props.bg)}
                weight={part.bold ? 'bold' : undefined}
                strikethrough={part.strike}
              >
                {part.text}
              </Text>
            ))}
          </Text>
        )
      })}
    </Text>
  )
}

export default ControlRow
