// The pane's chrome rows: the toolbar, the explorer's title, the file's header and the status row.
// Each is one row of items (text, controls, spacers), drawn by the controls surface module where
// the surface draws a Client, else as Text and plain Buttons (which keep their hotkeys).
import { cellsOf, spans } from './controls'
import type { ControlsProps, Item, Part } from './controls'
import { fileIcon, uiGlyph } from './icons'
import type { UiGlyph } from './icons'
import { truncate, truncateStart } from './text'
import { C } from './theme'
import type { Handlers, PaneModel } from './view'

export type Action = Exclude<keyof Handlers, 'pick' | 'toggle'>

// The pane's keys, for a Button's hotkey and for keys a surface module passes on.
export const HOTKEYS: Record<Action, string> = {
  tree: 't',
  collapseAll: 'c',
  prev: 'p',
  next: 'n',
  view: 'v',
  wrap: 'w',
  up: 'k',
  down: 'j',
  left: 'h',
  right: 'l',
}

const HINT = '#6e7681' // a control's key, drawn quiet beside its label

const text = (parts: Part[]): Item => ({ parts })
const spacer: Item = { spacer: true }

// A control, padded a cell each side so the pointer's background reads as a button.
function control(m: PaneModel, action: Action, glyph: UiGlyph, label?: string, isOn = false): Item {
  const hint: Part[] = label ? [{ text: ` ${HOTKEYS[action]}`, color: HINT }] : []
  return { action, isOn, parts: [{ text: ` ${uiGlyph(glyph, m.icons)}${label ? ` ${label}` : ''}` }, ...hint, { text: ' ' }] }
}

const width = (items: Item[]) => items.reduce((n, item) => n + ('spacer' in item ? 0 : item.parts.reduce((k, p) => k + cellsOf(p.text), 0)), 0)

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
      <Text color={part.color ?? C.fg} backgroundColor={part.bg ?? bg} weight={part.bold ? 'bold' : undefined} strikethrough={part.strike}>
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
          <Button key={action} plain hotkey={HOTKEYS[action]} onPress={() => m.on[action]()}>
            {paint(item.parts)}
          </Button>
        )
      })}
    </Box>
  )
}

export function Toolbar({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const adds = m.entries.reduce((n, e) => n + e.adds, 0)
  const dels = m.entries.reduce((n, e) => n + e.dels, 0)
  const count = `${m.entries.length} file${m.entries.length === 1 ? '' : 's'}`
  const isTight = m.at.width < 56
  const items: Item[] = [
    text([{ text: ' ' }]),
    control(m, 'tree', 'sidebar', isTight ? undefined : 'Explorer', m.at.showTree),
    text([
      { text: '  │  ', color: C.subtle },
      { text: 'CHANGES', color: C.fg, bold: true },
      ...(isTight
        ? []
        : [
            { text: `  ${count}  `, color: C.muted },
            { text: `+${adds} `, color: C.addFg },
            { text: `−${dels}`, color: C.delFg },
          ]),
    ]),
    spacer,
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

export function ExplorerHead({ m }: { m: PaneModel }) {
  const items: Item[] = [
    text([{ text: ' EXPLORER', color: C.muted, bold: true }]),
    spacer,
    control(m, 'collapseAll', m.canCollapse ? 'collapseAll' : 'expandAll'),
  ]
  return <ChromeRow m={m} id="explorer-head" w={m.at.treeWidth} bg={C.sidebar} items={items} />
}

// A GitHub diffstat: five blocks split between added and removed.
function diffstat(adds: number, dels: number) {
  const total = adds + dels
  if (total === 0) return { green: 0, red: 0, grey: 5 }
  const green = Math.round((adds / total) * 5)
  return { green, red: 5 - green, grey: 0 }
}

export function FileHead({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const w = m.at.previewWidth
  const sel = m.selected!
  const icon = fileIcon(sel.name, m.icons)
  const stat = diffstat(sel.adds, sel.dels)
  const right: Item[] = [
    text([
      { text: `+${sel.adds} `, color: C.addFg },
      { text: `−${sel.dels} `, color: C.delFg },
      { text: '■'.repeat(stat.green), color: C.addFg },
      { text: '■'.repeat(stat.red), color: C.delFg },
      { text: '■'.repeat(stat.grey), color: C.subtle },
      { text: '  ' },
    ]),
    control(m, 'prev', 'prev'),
    control(m, 'next', 'next'),
    text([{ text: ` ${m.position}/${m.entries.length} `, color: C.muted }]),
  ]
  const badge: Part[] =
    sel.status === 'A'
      ? [{ text: ' ' }, { text: ' NEW ', color: C.canvas, bg: C.addFg, bold: true }]
      : sel.status === 'D'
        ? [{ text: ' ' }, { text: ' DELETED ', color: C.canvas, bg: C.delFg, bold: true }]
        : []
  const lead = ` ${icon.glyph} `
  const room = w - width(right) - cellsOf(lead) - badge.reduce((n, p) => n + cellsOf(p.text), 0) - 1
  const crumbs = truncateStart(sel.rel.split('/').join(' › '), Math.max(4, room))
  const dir = crumbs.includes(' › ') ? crumbs.slice(0, crumbs.lastIndexOf(' › ') + 3) : ''
  const items: Item[] = [
    text([
      { text: lead, color: icon.color },
      { text: dir, color: C.muted },
      { text: crumbs.slice(dir.length), color: C.fg, bold: true },
      ...badge,
    ]),
    spacer,
    ...right,
  ]
  return (
    <Box flexDirection="column" width={w}>
      <ChromeRow m={m} id="file-head" w={w} bg={C.canvas} items={items} />
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(w)}
      </Text>
    </Box>
  )
}

// The status row: where the window stands, and the view, wrap and scroll controls.
export function StatusRow({ m }: { m: PaneModel }) {
  const w = m.at.previewWidth
  const isTight = w < 72
  const isDiff = m.view === 'diff'
  const segment = (glyph: UiGlyph, label: string, isOn: boolean): Part =>
    isOn
      ? { text: ` ${uiGlyph(glyph, m.icons)} ${label} `, color: C.fg, bg: C.segment, bold: true }
      : { text: ` ${uiGlyph(glyph, m.icons)} ${label} `, color: C.muted }
  const controls: Item[] = [
    { action: 'view', parts: [{ text: ' ' }, segment('diff', 'Diff', isDiff), segment('file', 'File', !isDiff), { text: ' v', color: HINT }, { text: ' ' }] },
    control(m, 'wrap', 'wrap', isTight ? undefined : 'Wrap', m.isWrapped),
    text([{ text: ' ' }]),
    control(m, 'up', 'up'),
    control(m, 'down', 'down'),
    ...(m.at.hasHbar ? [control(m, 'left', 'left'), control(m, 'right', 'right')] : []),
    text([{ text: ' ' }]),
  ]
  const first = m.previewTotal === 0 ? 0 : m.scroll.preview + 1
  const last = Math.min(m.previewTotal, m.scroll.preview + m.at.previewBody)
  const unit = isDiff ? 'rows' : 'lines'
  const cols =
    m.at.hasHbar && m.wideTotal > m.wideView
      ? ` · col ${m.scroll.x + 1}–${Math.min(m.wideTotal, m.scroll.x + m.wideView)}/${m.wideTotal}`
      : ''
  const where = isTight ? ` ${first}–${last}/${m.previewTotal}${cols}` : ` ${unit} ${first}–${last}/${m.previewTotal}${cols}`
  const items: Item[] = [text([{ text: truncate(where, Math.max(0, w - width(controls))), color: C.muted }]), spacer, ...controls]
  return <ChromeRow m={m} id="status" w={w} bg={C.header} items={items} />
}
