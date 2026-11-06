// What the pane draws: a toolbar, the list (newest reply first, a header per reply, a row per link)
// with its scrollbar, and a status row with the picked link's URL. A row's number and favicon are
// drawn here, where an Image can sit; its words and host by the list's surface module.
import type { Elements } from 'claude-code'

import type { Favicon, Locale } from '../types'
import { spans } from './controls'
import type { ControlsProps, Item, Part } from './controls'
import { badgeOf } from './favicon'
import type { ClientRow, ListProps } from './list-client'
import { CHIP, bodyOf, numberCell } from './rows'
import type { Columns, Row } from './rows'
import { thumbOf } from './scrollbar'
import type { BarProps } from './scrollbar'
import { pad, textWidth, truncate } from './text'
import { C } from './theme'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & {
  Client?: Elements['terminal']['Client'] // the terminal and desktop draw one
  Image?: Elements['terminal']['Image'] // the terminal alone
}

export type Action = 'open' | 'copy' | 'clear'

export const CHROME_ROWS = 4 // the toolbar and its rule, the status row and its rule

export type PaneModel = {
  els: Els
  width: number
  height: number
  listRows: number
  locale: Locale
  count: number
  columns: Columns
  rows: Row[] // the rows in the list's window
  total: number
  offset: number
  favicons: Record<string, Favicon>
  status: { text: string; color: string }
  onAction: (action: Action) => void
}

export const T = {
  ko: {
    title: 'LINKS',
    count: (n: number) => `${n}개`,
    open: '↗ 열기',
    copy: '⧉ 복사',
    clear: '✕ 비우기',
    empty: '아직 답변에 나온 링크가 없어요.',
    emptyHint: 'Claude가 링크를 쓰면 여기에 모여요.',
    hint: '↑↓ 고르기 · Enter 열기 · c 복사 · 클릭하면 바로 열려요',
  },
  en: {
    title: 'LINKS',
    count: (n: number) => `${n} link${n === 1 ? '' : 's'}`,
    open: '↗ Open',
    copy: '⧉ Copy',
    clear: '✕ Clear',
    empty: 'No links in the replies yet.',
    emptyHint: 'Links Claude writes collect here.',
    hint: '↑↓ pick · Enter opens · c copies · a click opens',
  },
} as const

const text = (parts: Part[]): Item => ({ parts })
const spacer: Item = { spacer: true }
const control = (action: Action, label: string): Item => ({ action, parts: [{ text: ` ${label} ` }] })

// A row of chrome: the controls surface module where the surface draws a Client, else Text and Buttons.
function ChromeRow({ m, id, w, bg, items }: { m: PaneModel; id: string; w: number; bg: string; items: Item[] }) {
  const { Box, Text, Button, Client } = m.els
  const props: ControlsProps = { width: w, bg, items, colors: { hover: C.controlHover, pressed: C.controlPressed, on: C.accent, fg: C.fg } }
  if (Client) return <Client key={id} module="./controls.tsx" props={props} width={w} height={1} />
  const layout = spans(items, w)
  const paint = (parts: Part[]) =>
    parts.map(part => (
      <Text color={part.color ?? C.fg} backgroundColor={part.bg ?? bg} weight={part.bold ? 'bold' : undefined}>
        {part.text}
      </Text>
    ))
  return (
    <Box flexDirection="row" width={w} height={1} overflow="hidden" backgroundColor={bg}>
      {items.map((item, i) => {
        const [a, b] = layout[i]!
        if ('spacer' in item) return <Text backgroundColor={bg}>{' '.repeat(b - a)}</Text>
        if (!item.action) return <Text backgroundColor={bg}>{paint(item.parts)}</Text>
        const action = item.action as Action
        return (
          <Button key={action} plain onPress={() => m.onAction(action)}>
            {paint(item.parts)}
          </Button>
        )
      })}
    </Box>
  )
}

// A vertical scrollbar: a Client the pointer drags, else a picture of one.
function Bar({ m, length }: { m: PaneModel; length: number }) {
  const { Box, Text, Client } = m.els
  const props: BarProps = {
    axis: 'v',
    length,
    total: m.total,
    view: length,
    offset: m.offset,
    colors: { track: C.track, thumb: C.thumb, active: C.thumbActive, bg: C.canvas },
  }
  if (Client) return <Client key="bar" module="./scrollbar.tsx" props={props} width={1} height={length} />
  const { start, size, max } = thumbOf(props)
  return (
    <Box flexDirection="column" width={1}>
      {Array.from({ length }, (_, i) => {
        const isThumb = max > 0 && i >= start && i < start + size
        return (
          <Text color={isThumb ? C.thumb : C.track} backgroundColor={C.canvas}>
            {isThumb ? '┃' : '│'}
          </Text>
        )
      })}
    </Box>
  )
}

function Toolbar({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const t = T[m.locale]
  const items: Item[] = [
    text([
      { text: ' 󰌷 ', color: C.accent, bold: true },
      { text: t.title, color: C.fg, bold: true },
      { text: `  ${t.count(m.count)}`, color: C.muted },
    ]),
    spacer,
    control('open', t.open),
    control('copy', t.copy),
    control('clear', t.clear),
    text([{ text: ' ' }]),
  ]
  return (
    <Box flexDirection="column" width={m.width}>
      <ChromeRow m={m} id="toolbar" w={m.width} bg={C.header} items={items} />
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(m.width)}
      </Text>
    </Box>
  )
}

// A link's favicon, a square two cells wide: its rounded tile, or where no tile could be made the
// bare icon on a light square (most icons are drawn for a light browser tab); until a picture is
// ready, or where the surface draws none, the host's letter on its color.
function FaviconTile({ m, row }: { m: PaneModel; row: Extract<Row, { kind: 'link' }> }) {
  const { Box, Text, Image } = m.els
  const badge = badgeOf(row.host)
  const icon = m.favicons[row.host]
  if (Image && icon?.state === 'ready') {
    const picture = <Image key={`icon:${row.key}`} source={{ file: icon.png, format: 'png' }} columns={CHIP} rows={1} alt={`${badge.letter} `} />
    if (icon.isTile) return picture
    return (
      <Box width={CHIP} height={1} backgroundColor={C.chip}>
        {picture}
      </Box>
    )
  }
  return (
    <Text color={C.badgeFg} backgroundColor={badge.color} weight="bold">
      {`${badge.letter} `}
    </Text>
  )
}

// The number and favicon columns, a row at a time; a header row draws the start of its rule here.
function Lead({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const lead = m.columns.lead
  return (
    <Box flexDirection="column" width={lead} height={m.listRows} backgroundColor={C.canvas}>
      {m.rows.map(row => {
        if (row.kind === 'gap') return <Text backgroundColor={C.canvas}>{' '.repeat(lead)}</Text>
        if (row.kind === 'head') return <Text color={C.subtle} backgroundColor={C.canvas}>{` ${'─'.repeat(lead - 1)}`}</Text>
        const bg = row.isSelected ? C.selected : C.canvas
        return (
          <Box flexDirection="row" width={lead} height={1} backgroundColor={bg}>
            <Text color={C.number} backgroundColor={bg} weight={row.isSelected ? 'bold' : undefined}>
              {numberCell(row.no, m.columns)}
            </Text>
            <FaviconTile m={m} row={row} />
            <Text backgroundColor={bg}> </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function clientRows(m: PaneModel): ClientRow[] {
  const w = m.columns.body
  return m.rows.map((row): ClientRow => {
    if (row.kind === 'gap') return { kind: 'gap' }
    if (row.kind === 'head') {
      const label = truncate(` ${row.label} `, w)
      return { kind: 'head', label, rule: '─'.repeat(Math.max(0, w - textWidth(label))) }
    }
    return { kind: 'link', key: row.key, isSelected: row.isSelected, ...bodyOf(row, m.columns) }
  })
}

// The words and hosts: the list's surface module where there is one, else plain rows.
function Body({ m }: { m: PaneModel }) {
  const { Box, Text, Client } = m.els
  const w = m.columns.body
  const rows = clientRows(m)
  if (Client) {
    const props: ListProps = {
      width: w,
      rows,
      colors: { bg: C.canvas, hover: C.hover, pressed: C.pressed, selected: C.selected, fg: C.fg, text: C.text, muted: C.muted, subtle: C.subtle, host: C.host, link: C.number },
    }
    return <Client key="list" module="./list-client.tsx" props={props} width={w} height={m.listRows} />
  }
  return (
    <Box flexDirection="column" width={w} height={m.listRows} backgroundColor={C.canvas}>
      {rows.map(row =>
        row.kind === 'gap' ? (
          <Text backgroundColor={C.canvas}>{' '.repeat(w)}</Text>
        ) : row.kind === 'head' ? (
          <Text backgroundColor={C.canvas}>
            <Text color={C.muted} weight="bold">
              {row.label}
            </Text>
            <Text color={C.subtle}>{row.rule}</Text>
          </Text>
        ) : (
          <Text backgroundColor={row.isSelected ? C.selected : C.canvas}>
            <Text color={row.isSelected ? C.fg : C.text}>{row.words}</Text>
            <Text>{row.gap}</Text>
            <Text color={C.host}>{row.host}</Text>
          </Text>
        ),
      )}
    </Box>
  )
}

function Empty({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const t = T[m.locale]
  const lines = ['', `   ${t.empty}`, `   ${t.emptyHint}`]
  return (
    <Box flexDirection="column" width={m.width} height={m.listRows} backgroundColor={C.canvas}>
      {lines.map((line, i) => (
        <Text color={i === 1 ? C.text : C.muted} backgroundColor={C.canvas}>
          {pad(line, m.width)}
        </Text>
      ))}
    </Box>
  )
}

function Status({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  return (
    <Box flexDirection="column" width={m.width}>
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(m.width)}
      </Text>
      <Text color={m.status.color} backgroundColor={C.header}>
        {pad(truncate(` ${m.status.text}`, m.width), m.width)}
      </Text>
    </Box>
  )
}

export function Pane({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const list =
    m.count === 0 ? (
      <Empty m={m} />
    ) : (
      <Box flexDirection="row" width={m.width} height={m.listRows} overflow="hidden" backgroundColor={C.canvas}>
        <Lead m={m} />
        <Body m={m} />
        <Bar m={m} length={m.listRows} />
      </Box>
    )
  return (
    // One row past the body, never shown: the engine sends a focused pane's arrow keys only while it
    // has rows to scroll, and the ui.scroll hook turns them into moves through the list.
    <Box flexDirection="column" width={m.width} height={m.height + 1} overflow="hidden" backgroundColor={C.canvas}>
      <Toolbar m={m} />
      {list}
      <Status m={m} />
      <Text backgroundColor={C.canvas}>{' '.repeat(m.width)}</Text>
    </Box>
  )
}
