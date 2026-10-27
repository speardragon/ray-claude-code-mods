// The tool panel: a toolbar, the calls on the left (newest last, followed as they come), and the
// picked call on the right in the view that suits its tool. Each column is a window of its own with
// its own scrollbar; narrow panes stack the list over the detail.
import type { Elements } from 'claude-code'

import { spans } from './controls'
import type { ControlsProps, Item, Part } from './controls'
import type { CallListProps, CallRow } from './list-client'
import { thumbOf } from './scrollbar'
import type { BarProps } from './scrollbar'
import type { Line } from './views'
import type { ImagePlace } from './views/image'
import { P } from './views/kit'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & { Client?: Elements['terminal']['Client']; Image?: Elements['terminal']['Image'] }

export type PanelLayout = { width: number; height: number; isStacked: boolean; listWidth: number; listRows: number; detailWidth: number; detailRows: number }

const TOOLBAR = 2
const DETAIL_HEAD = 2

export function panelLayout(width: number, height: number): PanelLayout {
  const body = Math.max(6, height - TOOLBAR)
  if (width < 84) {
    const listRows = Math.max(4, Math.floor(body * 0.35))
    return { width, height, isStacked: true, listWidth: width, listRows, detailWidth: width, detailRows: Math.max(2, body - listRows - 1 - DETAIL_HEAD) }
  }
  const listWidth = Math.max(32, Math.min(56, Math.round(width * 0.36)))
  return { width, height, isStacked: false, listWidth, listRows: body, detailWidth: width - listWidth - 1, detailRows: Math.max(2, body - DETAIL_HEAD) }
}

export type PanelModel = {
  els: Els
  at: PanelLayout
  counts: { all: number; running: number }
  follow: boolean
  rows: CallRow[] // the list's window
  listTotal: number
  listOffset: number
  head: Item[] | null
  detail: Line[]
  image?: ImagePlace // a picture over some of the detail's rows
  detailOffset: number
}

const COLORS = { hover: '#262c36', pressed: '#30363d', on: P.accent, fg: P.fg }

function ChromeRow({ m, id, w, bg, items }: { m: PanelModel; id: string; w: number; bg: string; items: Item[] }) {
  const { Box, Text, Client } = m.els
  const props: ControlsProps = { width: w, bg, items, colors: COLORS }
  if (Client) return <Client key={id} module="./controls.tsx" props={props} width={w} height={1} />
  const layout = spans(items, w)
  return (
    <Box flexDirection="row" width={w} height={1} overflow="hidden" backgroundColor={bg}>
      {items.map((item, i) =>
        'spacer' in item ? (
          <Text backgroundColor={bg}>{' '.repeat(layout[i]![1] - layout[i]![0])}</Text>
        ) : (
          <Text backgroundColor={bg}>
            {item.parts.map(p => (
              <Text color={p.color ?? P.fg} backgroundColor={p.bg ?? bg}>
                {p.text}
              </Text>
            ))}
          </Text>
        ),
      )}
    </Box>
  )
}

function Bar({ m, id, length, total, view, offset, bg }: { m: PanelModel; id: string; length: number; total: number; view: number; offset: number; bg: string }) {
  const { Box, Text, Client } = m.els
  const props: BarProps = { axis: 'v', length, total, view, offset, colors: { track: '#21262d', thumb: '#484f58', active: '#8b949e', bg } }
  if (Client) return <Client key={id} module="./scrollbar.tsx" props={props} width={1} height={length} />
  const { start, size, max } = thumbOf(props)
  return (
    <Box flexDirection="column" width={1}>
      {Array.from({ length }, (_, i) => (
        <Text color={max > 0 && i >= start && i < start + size ? '#484f58' : '#21262d'} backgroundColor={bg}>
          {max > 0 && i >= start && i < start + size ? '┃' : '│'}
        </Text>
      ))}
    </Box>
  )
}

function Toolbar({ m }: { m: PanelModel }) {
  const { Box, Text } = m.els
  const part = (text: string, color: string, bold = false): Part => ({ text, color, bold })
  const items: Item[] = [
    { parts: [part(' ⚒ ', P.accent, true), part('TOOLS', P.fg, true), part(`  ${m.counts.all} call${m.counts.all === 1 ? '' : 's'}`, P.muted), ...(m.counts.running ? [part(` · ${m.counts.running} running`, P.warn)] : [])] },
    { spacer: true },
    { action: 'follow', isOn: m.follow, parts: [{ text: ` ${m.follow ? '●' : '○'} Follow ` }] },
    { action: 'clear', parts: [{ text: ' Clear ' }] },
    { parts: [{ text: ' ' }] },
  ]
  return (
    <Box flexDirection="column" width={m.at.width}>
      <ChromeRow m={m} id="toolbar" w={m.at.width} bg={P.panel} items={items} />
      <Text color={P.border} backgroundColor={P.bg}>
        {'─'.repeat(m.at.width)}
      </Text>
    </Box>
  )
}

function ListColumn({ m }: { m: PanelModel }) {
  const { Box, Text, Client } = m.els
  const inner = m.at.listWidth - 1
  const props: CallListProps = {
    width: inner,
    rows: m.rows,
    colors: { bg: '#010409', hover: '#161b22', pressed: '#262c36', selected: '#21262d', accent: P.accent, text: P.text, sub: P.faint },
  }
  const body =
    m.listTotal === 0 ? (
      <Box flexDirection="column" width={inner}>
        <Text backgroundColor="#010409"> </Text>
        <Text backgroundColor="#010409" color={P.muted}>
          {'  No tool calls yet.'.padEnd(inner)}
        </Text>
      </Box>
    ) : Client ? (
      <Client key="list" module="./list-client.tsx" props={props} width={inner} height={m.at.listRows} />
    ) : (
      <Box flexDirection="column" width={inner}>
        {m.rows.map(r => (
          <Text backgroundColor={r.isSelected ? '#21262d' : '#010409'} color={P.text} wrap="truncate-end">
            {` ${r.glyph} ${r.tool} ${r.subject}`}
          </Text>
        ))}
      </Box>
    )
  return (
    <Box flexDirection="row" width={m.at.listWidth} height={m.at.listRows} overflow="hidden" backgroundColor="#010409">
      <Box flexDirection="column" width={inner} height={m.at.listRows} backgroundColor="#010409">
        {body}
      </Box>
      <Bar m={m} id="lbar" length={m.at.listRows} total={m.listTotal} view={m.at.listRows} offset={m.listOffset} bg="#010409" />
    </Box>
  )
}

function DrawLine({ m, line, width }: { m: PanelModel; line: Line; width: number }) {
  const { Text } = m.els
  return (
    <Text backgroundColor={P.bg} wrap="truncate-end">
      {line.length === 0 ? ' ' : line.map(sp => <Text {...sp.paint}>{sp.text}</Text>)}
    </Text>
  )
}

function DetailColumn({ m }: { m: PanelModel }) {
  const { Box, Text } = m.els
  const w = m.at.detailWidth
  const inner = w - 2 // a cell of margin, and the scrollbar
  const tall = m.at.detailRows + DETAIL_HEAD
  if (!m.head) {
    return (
      <Box flexDirection="column" width={w} height={tall} backgroundColor={P.bg}>
        <Text backgroundColor={P.bg}> </Text>
        <Text backgroundColor={P.bg} color={P.muted}>
          {'  Pick a call on the left.'.padEnd(w)}
        </Text>
      </Box>
    )
  }
  const from = m.detailOffset
  const window = m.detail.slice(from, from + m.at.detailRows)
  // The picture only when its whole block is in view; scrolled partly out, its placeholder rows show.
  const pic = m.image && m.els.Image && m.image.at >= from && m.image.at + m.image.rows <= from + m.at.detailRows ? m.image : undefined
  const Picture = m.els.Image
  const lines = (part: Line[]) => part.map(line => <DrawLine m={m} line={line} width={inner} />)
  return (
    <Box flexDirection="column" width={w} height={tall} overflow="hidden" backgroundColor={P.bg}>
      <ChromeRow m={m} id="dhead" w={w} bg={P.bg} items={m.head} />
      <Text color={P.border} backgroundColor={P.bg}>
        {'─'.repeat(w)}
      </Text>
      <Box flexDirection="row" width={w} height={m.at.detailRows} backgroundColor={P.bg}>
        <Box flexDirection="column" width={inner + 1} height={m.at.detailRows} overflow="hidden" backgroundColor={P.bg} paddingLeft={1}>
          {pic && Picture
            ? [
                ...lines(m.detail.slice(from, pic.at)),
                <Picture source={{ file: pic.file, format: 'png' }} columns={pic.columns} rows={pic.rows} alt={pic.alt} />,
                ...lines(m.detail.slice(pic.at + pic.rows, from + m.at.detailRows)),
              ]
            : lines(window)}
        </Box>
        <Bar m={m} id="dbar" length={m.at.detailRows} total={m.detail.length} view={m.at.detailRows} offset={m.detailOffset} bg={P.bg} />
      </Box>
    </Box>
  )
}

export function Panel({ m }: { m: PanelModel }) {
  const { Box, Text } = m.els
  const columns = m.at.isStacked ? (
    <Box flexDirection="column" width={m.at.width} overflow="hidden" backgroundColor={P.bg}>
      <ListColumn m={m} />
      <Text color={P.border} backgroundColor={P.bg}>
        {'─'.repeat(m.at.width)}
      </Text>
      <DetailColumn m={m} />
    </Box>
  ) : (
    <Box flexDirection="row" width={m.at.width} overflow="hidden" backgroundColor={P.bg}>
      <ListColumn m={m} />
      <Box flexDirection="column" width={1}>
        {Array.from({ length: m.at.listRows }, () => (
          <Text color={P.border} backgroundColor={P.bg}>
            │
          </Text>
        ))}
      </Box>
      <DetailColumn m={m} />
    </Box>
  )
  return (
    // One row past the body, never shown: the engine sends a focused pane's arrow keys only while it
    // has rows to scroll, and the ui.scroll hook turns them into moves through the list.
    <Box flexDirection="column" width={m.at.width} height={m.at.height + 1} overflow="hidden" backgroundColor={P.bg}>
      <Toolbar m={m} />
      {columns}
      <Text backgroundColor={P.bg}>{' '.repeat(m.at.width)}</Text>
    </Box>
  )
}
