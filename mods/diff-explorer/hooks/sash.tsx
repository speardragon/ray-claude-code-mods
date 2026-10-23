// The line between the explorer and the preview, drawn by a surface module so it can be dragged
// as VS Code's sash is: it lights in the accent color under the pointer, a drag posts the explorer's
// new width, a double click puts it back to the default, and once clicked ← → resize it too.
import type { ClientModule } from 'claude-code'

export type SashProps = {
  height: number
  treeWidth: number // the explorer's width now, the sash standing just right of it
  min: number
  max: number
  colors: { line: string; hot: string; bg: string }
}

// `width: null` puts the default back; `isDone` marks the end of a drag, the width to keep.
export type SashMessage = { width: number | null; isDone: boolean } | { press: string }

// `lastClick`: when the last press that did not move ended, for telling a double click.
type State = { isHot: boolean; isDragging: boolean; hasMoved: boolean; lastClick: number }

const DOUBLE_CLICK_MS = 400
const KEY_STEP = 2

const Sash: ClientModule<SashProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { isHot: false, isDragging: false, hasMoved: false, lastClick: 0 }
  const clamp = (n: number) => Math.max(props.min, Math.min(props.max, n))
  const send = (width: number | null, isDone: boolean) => surface.post({ width, isDone } satisfies SashMessage)

  surface.onPointer(event => {
    if (event.type === 'enter' && !state.isHot) surface.setState({ ...state, isHot: true })
    else if (event.type === 'leave' && !state.isDragging && state.isHot) surface.setState({ ...state, isHot: false })
    else if (event.type === 'down' && event.button === 'left') surface.setState({ ...state, isHot: true, isDragging: true, hasMoved: false })
    else if (event.type === 'move' && state.isDragging) {
      // The region sits where the explorer ends, so the pointer's column is how far to move it.
      const next = clamp(props.treeWidth + event.x)
      if (next !== props.treeWidth) {
        if (!state.hasMoved) surface.setState({ ...state, hasMoved: true })
        send(next, false)
      }
    } else if (event.type === 'up' && state.isDragging) {
      const now = Date.now()
      const isClick = !state.hasMoved
      const isDouble = isClick && now - state.lastClick < DOUBLE_CLICK_MS
      surface.setState({ isHot: event.x === 0, isDragging: false, hasMoved: false, lastClick: isClick && !isDouble ? now : 0 })
      if (isDouble) send(null, true)
      else if (!isClick) send(props.treeWidth, true)
    }
  })

  surface.onKey(event => {
    if (event.key === 'left') send(clamp(props.treeWidth - KEY_STEP), true)
    else if (event.key === 'right') send(clamp(props.treeWidth + KEY_STEP), true)
    else if (!event.ctrl && !event.meta) surface.post({ press: event.key } satisfies SashMessage)
  })

  const isLit = state.isHot || state.isDragging
  return (
    <Box flexDirection="column" width={1}>
      {Array.from({ length: props.height }, () => (
        <Text color={isLit ? props.colors.hot : props.colors.line} backgroundColor={props.colors.bg}>
          {isLit ? '┃' : '│'}
        </Text>
      ))}
    </Box>
  )
}

export default Sash
