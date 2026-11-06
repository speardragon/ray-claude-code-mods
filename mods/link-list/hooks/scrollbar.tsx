// A thin scrollbar, vertical or horizontal, drawn by a surface module: the thumb follows a drag,
// a click on the track jumps there, and once clicked it takes the arrow, page, Home and End keys.
// It posts where the window should stand; the hooks module owns the offset.
import type { ClientModule } from 'claude-code'

export type BarProps = {
  axis: 'v' | 'h'
  length: number // cells along the bar
  total: number // rows or columns of content
  view: number // rows or columns the window shows
  offset: number // where the window starts
  colors: { track: string; thumb: string; active: string; bg: string }
}

// Where the window should stand, or a key the bar does not use, for the pane's keymap.
export type BarMessage = { offset: number } | { press: string }

type State = { isHot: boolean; grab: number | null } // grab: where on the thumb the drag took it

export function thumbOf(p: Pick<BarProps, 'length' | 'total' | 'view' | 'offset'>) {
  const max = Math.max(0, p.total - p.view)
  if (max === 0 || p.length <= 0) return { start: 0, size: p.length, max }
  const size = Math.max(1, Math.min(p.length, Math.round((p.length * p.view) / p.total)))
  const start = Math.round(((p.length - size) * Math.min(p.offset, max)) / max)
  return { start, size, max }
}

const Scrollbar: ClientModule<BarProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { isHot: false, grab: null }
  const { start, size, max } = thumbOf(props)
  const isV = props.axis === 'v'
  const page = Math.max(1, props.view - 2)

  // The offset whose thumb starts at `cell`, clamped to the content.
  const offsetAt = (cell: number) => {
    const room = props.length - size
    return room <= 0 ? 0 : Math.max(0, Math.min(max, Math.round((cell / room) * max)))
  }
  const send = (offset: number) => {
    const clamped = Math.max(0, Math.min(max, offset))
    if (clamped !== props.offset) surface.post({ offset: clamped } satisfies BarMessage)
  }

  surface.onPointer(event => {
    const at = isV ? event.y : event.x
    if (event.type === 'enter' && !state.isHot) surface.setState({ ...state, isHot: true })
    else if (event.type === 'leave' && state.grab === null && state.isHot) surface.setState({ ...state, isHot: false })
    else if (event.type === 'down' && event.button === 'left' && max > 0) {
      const onThumb = at >= start && at < start + size
      const grab = onThumb ? at - start : Math.floor(size / 2)
      surface.setState({ isHot: true, grab })
      if (!onThumb) send(offsetAt(at - grab))
    } else if (event.type === 'move' && state.grab !== null) send(offsetAt(at - state.grab))
    else if (event.type === 'up' && state.grab !== null) surface.setState({ ...state, grab: null })
  })

  surface.onKey(event => {
    const back = isV ? 'up' : 'left'
    const fwd = isV ? 'down' : 'right'
    const step = isV ? 1 : 4
    if (event.key === back) send(props.offset - step)
    else if (event.key === fwd) send(props.offset + step)
    else if (event.key === 'pageup') send(props.offset - page)
    else if (event.key === 'pagedown') send(props.offset + page)
    else if (event.key === 'home') send(0)
    else if (event.key === 'end') send(max)
    else if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies BarMessage)
  })

  const thumbColor = state.grab !== null || state.isHot ? props.colors.active : props.colors.thumb
  const cell = (i: number) => {
    const isThumb = max > 0 && i >= start && i < start + size
    if (isV) return isThumb ? '┃' : '│'
    return isThumb ? '━' : '─'
  }
  const colorOf = (i: number) => (max > 0 && i >= start && i < start + size ? thumbColor : props.colors.track)

  if (isV) {
    return (
      <Box flexDirection="column" width={1}>
        {Array.from({ length: props.length }, (_, i) => (
          <Text color={colorOf(i)} backgroundColor={props.colors.bg}>
            {cell(i)}
          </Text>
        ))}
      </Box>
    )
  }
  const before = max > 0 ? start : 0
  const thumb = max > 0 ? size : 0
  return (
    <Text backgroundColor={props.colors.bg}>
      <Text color={props.colors.track}>{'─'.repeat(before)}</Text>
      <Text color={thumbColor}>{'━'.repeat(thumb)}</Text>
      <Text color={props.colors.track}>{'─'.repeat(Math.max(0, props.length - before - thumb))}</Text>
    </Text>
  )
}

export default Scrollbar
