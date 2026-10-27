// One tool call's line in the transcript, drawn by a surface module: the pointer lights it
// quietly, and a click posts it to be unfolded or folded.
import type { ClientModule } from 'claude-code'

export type RowProps = {
  id: string
  width: number
  isOpen: boolean
  dot: { glyph: string; color: string }
  tool: string
  toolColor: string
  subject: string // already cut to fit
  meta: { text: string; color: string; sep: string }[] // `sep` goes before it
  colors: { hover: string; chevron: string; text: string; sep: string }
}

export type RowMessage = { toggle: string }

const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const isWide = (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xff00 && cp <= 0xff60) || /\p{Emoji_Presentation}/u.test(ch)
    return n + (isWide ? 2 : 1)
  }, 0)

type State = { isHot: boolean }

const ToolRow: ClientModule<RowProps, State> = (props, surface) => {
  const { Text } = surface.elements
  const isHot = surface.state?.isHot ?? false
  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'move') {
      if (!isHot) surface.setState({ isHot: true })
    } else if (event.type === 'leave') {
      if (isHot) surface.setState({ isHot: false })
    } else if (event.type === 'up' && event.button === 'left') {
      surface.post({ toggle: props.id } satisfies RowMessage)
    }
  })
  const bg = isHot ? props.colors.hover : undefined
  const metaText = props.meta.map((m, i) => (i > 0 ? m.sep : '') + m.text).join('')
  const head = `${props.isOpen ? '▾' : '▸'} ${props.dot.glyph} ${props.tool}  ${props.subject}`
  const gap = Math.max(2, props.width - cells(head) - cells(metaText) - 1)
  return (
    <Text backgroundColor={bg} wrap="truncate-end">
      <Text color={props.colors.chevron}>{props.isOpen ? '▾ ' : '▸ '}</Text>
      <Text color={props.dot.color}>{props.dot.glyph} </Text>
      <Text color={props.toolColor} weight="bold">
        {props.tool}
      </Text>
      <Text color={props.colors.text}>{`  ${props.subject}`}</Text>
      <Text>{' '.repeat(gap)}</Text>
      {props.meta.map((m, i) => (
        <Text color={m.color}>{`${i > 0 ? m.sep : ''}${m.text}`}</Text>
      ))}
      <Text> </Text>
    </Text>
  )
}

export default ToolRow
