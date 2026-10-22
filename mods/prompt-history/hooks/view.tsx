// What the pane draws: a toolbar, the prompt list on the left and the picked prompt in full on
// the right, each column a window of its own with its own scrollbar. Narrow panes stack
// the list over the preview.
import type { Elements } from 'claude-code'

import type { Locale, Prompt } from '../types'
import { spans } from './controls'
import type { ControlsProps, Item, Part } from './controls'
import type { ListProps, ListRow } from './list-client'
import { thumbOf } from './scrollbar'
import type { BarProps } from './scrollbar'
import { pad, textWidth, truncate } from './text'
import { C } from './theme'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & {
  Client?: Elements['terminal']['Client'] // the terminal and desktop draw one
}

export type Action = 'locale' | 'up' | 'down' | 'jump'

export type Layout = {
  width: number
  height: number
  isStacked: boolean // too narrow for two columns: the list sits over the preview
  listWidth: number // the list's columns, its scrollbar included
  listRows: number // rows the list's window shows
  previewWidth: number // the preview's columns, its scrollbar included
  previewRows: number // rows the preview's text window shows
}

const TOOLBAR_ROWS = 2 // the toolbar and the rule under it
const PREVIEW_HEAD = 2 // the prompt's header and the rule under it
const PREVIEW_FOOT = 1 // the status row
const SIDE_BY_SIDE = 70 // narrower panes stack

export function layout(width: number, height: number): Layout {
  const body = Math.max(4, height - TOOLBAR_ROWS)
  const isStacked = width < SIDE_BY_SIDE
  if (isStacked) {
    const listRows = Math.max(3, Math.floor(body * 0.45))
    return {
      width,
      height,
      isStacked,
      listWidth: width,
      listRows,
      previewWidth: width,
      previewRows: Math.max(1, body - listRows - 1 - PREVIEW_HEAD - PREVIEW_FOOT),
    }
  }
  const listWidth = Math.max(30, Math.min(64, Math.round(width * 0.44)))
  return {
    width,
    height,
    isStacked,
    listWidth,
    listRows: body,
    previewWidth: width - listWidth - 1,
    previewRows: Math.max(1, body - PREVIEW_HEAD - PREVIEW_FOOT),
  }
}

// One prompt as the preview shows it.
export type Shown = {
  prompt: Prompt
  no: number
  rows: string[] // its text wrapped to the preview
  when: string // 오후 2:31 · 12분 전
}

export type PaneModel = {
  els: Els
  at: Layout
  locale: Locale
  count: number
  list: ListRow[] // the rows in the list's window
  listTotal: number
  listOffset: number
  shown: Shown | null
  previewOffset: number
  note: string
  onAction: (action: Action) => void
}

const T = {
  ko: { title: 'PROMPTS', count: (n: number) => `${n}개`, empty: '아직 보낸 프롬프트가 없어요.', emptyHint: '프롬프트를 보내면 여기에 쌓여요.', jump: '↗ 이동', copy: '⧉ 복사', picked: '↑↓ 고르기 · Enter 이동', lines: '줄', chars: '자', pick: '목록에서 프롬프트를 고르세요.' },
  en: { title: 'PROMPTS', count: (n: number) => `${n} prompt${n === 1 ? '' : 's'}`, empty: 'No prompts yet.', emptyHint: 'Prompts you send collect here.', jump: '↗ Jump', copy: '⧉ Copy', picked: '↑↓ pick · Enter jumps', lines: 'lines', chars: 'chars', pick: 'Pick a prompt from the list.' },
} as const

// ---- building blocks --------------------------------------------------------------------------

const text = (parts: Part[]): Item => ({ parts })
const spacer: Item = { spacer: true }
const control = (action: Action, label: string, isOn = false): Item => ({ action, isOn, parts: [{ text: ` ${label} ` }] })

// A row of chrome: the controls surface module where the surface draws a Client, else Text and Buttons.
function ChromeRow({ m, id, w, bg, items }: { m: PaneModel; id: string; w: number; bg: string; items: Item[] }) {
  const { Box, Text, Button, Client } = m.els
  const props: ControlsProps = {
    width: w,
    bg,
    items,
    colors: { hover: C.controlHover, pressed: C.controlPressed, on: C.accent, fg: C.fg },
  }
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
function Bar({ m, id, length, total, view, offset, bg }: {
  m: PaneModel
  id: string
  length: number
  total: number
  view: number
  offset: number
  bg: string
}) {
  const { Box, Text, Client } = m.els
  const props: BarProps = {
    axis: 'v',
    length,
    total,
    view,
    offset,
    colors: { track: C.track, thumb: C.thumb, active: C.thumbActive, bg },
  }
  if (Client) return <Client key={id} module="./scrollbar.tsx" props={props} width={1} height={length} />
  const { start, size, max } = thumbOf(props)
  return (
    <Box flexDirection="column" width={1}>
      {Array.from({ length }, (_, i) => {
        const isThumb = max > 0 && i >= start && i < start + size
        return (
          <Text color={isThumb ? C.thumb : C.track} backgroundColor={bg}>
            {isThumb ? '┃' : '│'}
          </Text>
        )
      })}
    </Box>
  )
}

// ---- the parts --------------------------------------------------------------------------------

function Toolbar({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const t = T[m.locale]
  const segment = (label: string, isOn: boolean): Part =>
    isOn ? { text: ` ${label} `, color: C.fg, bg: C.segment, bold: true } : { text: ` ${label} `, color: C.muted }
  const items: Item[] = [
    text([
      { text: ' ❯ ', color: C.accent, bold: true },
      { text: t.title, color: C.fg, bold: true },
      { text: `  ${t.count(m.count)}`, color: C.muted },
    ]),
    spacer,
    { action: 'locale', parts: [{ text: ' ' }, segment('한국어', m.locale === 'ko'), segment('EN', m.locale === 'en'), { text: ' ' }] },
    text([{ text: ' ' }]),
  ]
  return (
    <Box flexDirection="column" width={m.at.width}>
      <ChromeRow m={m} id="toolbar" w={m.at.width} bg={C.header} items={items} />
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(m.at.width)}
      </Text>
    </Box>
  )
}

function ListColumn({ m }: { m: PaneModel }) {
  const { Box, Text, Client } = m.els
  const inner = m.at.listWidth - 1
  const t = T[m.locale]
  const props: ListProps = {
    width: inner,
    rows: m.list,
    colors: { bg: C.sidebar, hover: C.hover, pressed: C.pressed, selected: C.selected, accent: C.accent, fg: C.fg, muted: C.muted, subtle: C.subtle },
  }
  const body =
    m.count === 0 ? (
      <Box flexDirection="column" width={inner}>
        <Text backgroundColor={C.sidebar}>{' '.repeat(inner)}</Text>
        <Text backgroundColor={C.sidebar} color={C.fg}>
          {pad(`  ${t.empty}`, inner)}
        </Text>
        <Text backgroundColor={C.sidebar} color={C.muted}>
          {pad(`  ${t.emptyHint}`, inner)}
        </Text>
      </Box>
    ) : Client ? (
      <Client key="list" module="./list-client.tsx" props={props} width={inner} height={m.at.listRows} />
    ) : (
      <Box flexDirection="column" width={inner}>
        {m.list.map(row =>
          row.kind === 'day' ? (
            <Text backgroundColor={C.sidebar} color={C.muted} weight="bold">
              {pad(` ${row.label}`, inner)}
            </Text>
          ) : (
            <Text backgroundColor={row.isSelected ? C.selected : C.sidebar} color={C.text} wrap="truncate-end">
              {pad(` ${row.no} ❯ ${row.text}`, inner - textWidth(row.time) - 1)}
              <Text color={C.muted}>{row.time} </Text>
            </Text>
          ),
        )}
      </Box>
    )
  return (
    <Box flexDirection="row" width={m.at.listWidth} height={m.at.listRows} overflow="hidden" backgroundColor={C.sidebar}>
      <Box flexDirection="column" width={inner} height={m.at.listRows} backgroundColor={C.sidebar}>
        {body}
      </Box>
      <Bar m={m} id="lbar" length={m.at.listRows} total={m.listTotal} view={m.at.listRows} offset={m.listOffset} bg={C.sidebar} />
    </Box>
  )
}

function PreviewHead({ m }: { m: PaneModel }) {
  const { Box, Text, Button } = m.els
  const t = T[m.locale]
  const w = m.at.previewWidth
  const shown = m.shown!
  const stats = ` ${shown.prompt.text.split('\n').length}${m.locale === 'ko' ? '' : ' '}${t.lines} · ${shown.prompt.text.length.toLocaleString('en-US')}${m.locale === 'ko' ? '' : ' '}${t.chars} `
  const buttons = textWidth(t.copy) + 4 + 1 + textWidth(t.jump) + 4 + 1 // each `[ label ]` and a cell after
  const lead = ` #${shown.no}  ${shown.when}`
  // The counts go first when the buttons leave too little room for them.
  const hasStats = textWidth(lead) + 1 + textWidth(stats) <= w - buttons
  const items: Item[] = [
    text([
      { text: ` #${shown.no}`, color: C.accent, bold: true },
      { text: `  ${shown.when}`, color: C.muted },
    ]),
    spacer,
    ...(hasStats ? [text([{ text: stats, color: C.subtle }])] : []),
  ]
  return (
    <Box flexDirection="column" width={w}>
      <Box flexDirection="row" width={w} height={1} overflow="hidden" backgroundColor={C.canvas}>
        <ChromeRow m={m} id="phead" w={Math.max(1, w - buttons)} bg={C.canvas} items={items} />
        {/* Both handled by `ui.press` hooks, whose `$` answers the press: a closure here would not. */}
        <Button key="copy" onPress={() => undefined}>
          {t.copy}
        </Button>
        <Text backgroundColor={C.canvas}> </Text>
        <Button key="jump" variant="primary" autoFocus onPress={() => undefined}>
          {t.jump}
        </Button>
        <Text backgroundColor={C.canvas}> </Text>
      </Box>
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(w)}
      </Text>
    </Box>
  )
}

function PreviewFoot({ m }: { m: PaneModel }) {
  const t = T[m.locale]
  const w = m.at.previewWidth
  const shown = m.shown!
  const total = shown.rows.length
  const first = total === 0 ? 0 : m.previewOffset + 1
  const last = Math.min(total, m.previewOffset + m.at.previewRows)
  // A note starting with ✓ reports something done (a copy); any other, something refused.
  const state = m.note.startsWith('✓')
    ? { text: ` ${m.note}`, color: C.ok }
    : m.note
      ? { text: ` ⚠ ${m.note}`, color: C.warn }
      : { text: ` ${t.picked}`, color: C.muted }
  const controls: Item[] = [control('up', '▲'), control('down', '▼'), text([{ text: ' ' }])]
  const where = text([{ text: `  ${first}–${last}/${total}`, color: C.muted }])
  const room = w - 6 - 1 - 14
  const items: Item[] = [text([{ ...state, text: truncate(state.text, Math.max(0, room)) }]), where, spacer, ...controls]
  return <ChromeRow m={m} id="pfoot" w={w} bg={C.header} items={items} />
}

function PreviewColumn({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const w = m.at.previewWidth
  const inner = w - 1
  const tall = m.at.previewRows + PREVIEW_HEAD + PREVIEW_FOOT
  if (!m.shown) {
    const lines = ['', `  ${m.count === 0 ? '' : T[m.locale].pick}`]
    return (
      <Box flexDirection="column" width={w} height={tall} backgroundColor={C.canvas}>
        {lines.map(line => (
          <Text backgroundColor={C.canvas} color={C.muted}>
            {pad(line, w)}
          </Text>
        ))}
      </Box>
    )
  }
  const window = m.shown.rows.slice(m.previewOffset, m.previewOffset + m.at.previewRows)
  return (
    <Box flexDirection="column" width={w} height={tall} overflow="hidden" backgroundColor={C.canvas}>
      <PreviewHead m={m} />
      <Box flexDirection="row" width={w} height={m.at.previewRows} backgroundColor={C.canvas}>
        <Box flexDirection="column" width={inner} height={m.at.previewRows} overflow="hidden" backgroundColor={C.canvas}>
          {window.map(row => (
            <Text backgroundColor={C.canvas} color={C.text}>
              {pad(`  ${row}`, inner)}
            </Text>
          ))}
        </Box>
        <Bar m={m} id="pbar" length={m.at.previewRows} total={m.shown.rows.length} view={m.at.previewRows} offset={m.previewOffset} bg={C.canvas} />
      </Box>
      <PreviewFoot m={m} />
    </Box>
  )
}

export function Pane({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const columns = m.at.isStacked ? (
    <Box flexDirection="column" width={m.at.width} overflow="hidden" backgroundColor={C.canvas}>
      <ListColumn m={m} />
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(m.at.width)}
      </Text>
      <PreviewColumn m={m} />
    </Box>
  ) : (
    <Box flexDirection="row" width={m.at.width} overflow="hidden" backgroundColor={C.canvas}>
      <ListColumn m={m} />
      <Box flexDirection="column" width={1}>
        {Array.from({ length: m.at.listRows }, () => (
          <Text color={C.border} backgroundColor={C.canvas}>
            │
          </Text>
        ))}
      </Box>
      <PreviewColumn m={m} />
    </Box>
  )
  return (
    // One row past the body, never shown: the engine sends the pane's arrow keys only while it has
    // rows to scroll, and the ui.scroll hook turns them into moves through the list.
    <Box flexDirection="column" width={m.at.width} height={m.at.height + 1} overflow="hidden" backgroundColor={C.canvas}>
      <Toolbar m={m} />
      {columns}
      <Text backgroundColor={C.canvas}>{' '.repeat(m.at.width)}</Text>
    </Box>
  )
}
