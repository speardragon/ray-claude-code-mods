// What the pane draws: a toolbar, the installed plugins on the left, and the picked one on the
// right: its name, scope and switch, its commands as buttons that open its panels, and its README.
import type { Elements } from 'claude-code'

import type { Filter, ModEntry } from '../types'
import { spans } from './controls'
import type { ControlsProps, Item, Part } from './controls'
import type { ListProps, ListRow } from './list-client'
import type { MdRow } from './markdown'
import { thumbOf } from './scrollbar'
import type { BarProps } from './scrollbar'
import { pad, textWidth, truncate, wrapText } from './text'
import { C } from './theme'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & {
  Client?: Elements['terminal']['Client']
}

export type Layout = {
  width: number
  height: number
  isStacked: boolean
  listWidth: number // the list's columns, its scrollbar included
  listRows: number
  detailWidth: number // the detail's columns, its scrollbar included
  detailHeight: number // all the detail's rows
}

const TOOLBAR_ROWS = 2
const SIDE_BY_SIDE = 72

export function layout(width: number, height: number): Layout {
  const body = Math.max(6, height - TOOLBAR_ROWS)
  if (width < SIDE_BY_SIDE) {
    const listRows = Math.max(4, Math.floor(body * 0.4))
    return { width, height, isStacked: true, listWidth: width, listRows, detailWidth: width, detailHeight: body - listRows - 1 }
  }
  const listWidth = Math.max(32, Math.min(52, Math.round(width * 0.4)))
  return { width, height, isStacked: false, listWidth, listRows: body, detailWidth: width - listWidth - 1, detailHeight: body }
}

export type Detail = {
  entry: ModEntry
  isSelf: boolean
  readme: MdRow[] // wrapped to the detail's text width
}

export type PaneModel = {
  els: Els
  at: Layout
  filter: Filter
  counts: { shown: number; on: number }
  list: ListRow[] // the rows in the list's window
  listTotal: number
  listOffset: number
  detail: Detail | null
  detailOffset: number
  busy: string
  note: string
  needsReload: boolean
  isLoaded: boolean
}

// The detail's fixed rows above the README, for the README's window to start under.
export function detailHead(d: Detail, width: number) {
  const text = Math.max(8, width - 3)
  const description = d.entry.description ? wrapText(d.entry.description, text).slice(0, 4) : []
  const commandRows = commandLines(d.entry, width).length
  // header + rule + meta + description + blank + commands title + commands + rule
  return { description, rows: 2 + 1 + description.length + 1 + 1 + Math.max(1, commandRows) + 1 }
}

// The commands as controls, laid in as many rows as the width needs.
export function commandLines(entry: ModEntry, width: number): Item[][] {
  const lines: Item[][] = [[]]
  let used = 1
  for (const command of entry.commands) {
    const label = ` /${command.name} `
    const w = textWidth(label) + 1
    if (used + w > width - 1 && lines[lines.length - 1]!.length > 0) {
      lines.push([])
      used = 1
    }
    lines[lines.length - 1]!.push({ action: `run:${command.name}`, parts: [{ text: label, color: C.accent, bg: '#121d2f' }] }, { parts: [{ text: ' ' }] })
    used += w
  }
  return lines[0]!.length === 0 ? [] : lines
}

// ---- building blocks --------------------------------------------------------------------------

const text = (parts: Part[]): Item => ({ parts })
const spacer: Item = { spacer: true }

function ChromeRow({ m, id, w, bg, items }: { m: PaneModel; id: string; w: number; bg: string; items: Item[] }) {
  const { Box, Text, Client } = m.els
  const props: ControlsProps = {
    width: w,
    bg,
    items: [{ parts: [{ text: ' ' }] }, ...items],
    colors: { hover: C.controlHover, pressed: C.controlPressed, on: C.accent, fg: C.fg },
  }
  if (Client) return <Client key={id} module="./controls.tsx" props={props} width={w} height={1} />
  const layout = spans(props.items, w)
  return (
    <Box flexDirection="row" width={w} height={1} overflow="hidden" backgroundColor={bg}>
      {props.items.map((item, i) => {
        const [a, b] = layout[i]!
        if ('spacer' in item) return <Text backgroundColor={bg}>{' '.repeat(b - a)}</Text>
        return (
          <Text backgroundColor={bg}>
            {item.parts.map(part => (
              <Text color={part.color ?? C.fg} backgroundColor={part.bg ?? bg}>
                {part.text}
              </Text>
            ))}
          </Text>
        )
      })}
    </Box>
  )
}

function Bar({ m, id, length, total, view, offset, bg }: { m: PaneModel; id: string; length: number; total: number; view: number; offset: number; bg: string }) {
  const { Box, Text, Client } = m.els
  const props: BarProps = { axis: 'v', length, total, view, offset, colors: { track: C.track, thumb: C.thumb, active: C.thumbActive, bg } }
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
  const segment = (label: string, isOn: boolean): Part =>
    isOn ? { text: ` ${label} `, color: C.fg, bg: C.segment, bold: true } : { text: ` ${label} `, color: C.muted }
  const what = m.filter === 'mods' ? 'mods' : 'plugins'
  const items: Item[] = [
    text([
      { text: '❖ ', color: C.accent, bold: true },
      { text: 'MODS', color: C.fg, bold: true },
      { text: m.isLoaded ? `  ${m.counts.shown} ${what} · ${m.counts.on} on` : '  loading…', color: C.muted },
      ...(m.busy ? [{ text: `  ⋯ ${m.busy}`, color: C.warn }] : []),
    ]),
    spacer,
    { action: 'filter', parts: [{ text: ' ' }, segment('Mods', m.filter === 'mods'), segment('All', m.filter === 'all'), { text: ' ' }] },
    text([{ text: ' ' }]),
    { action: 'refresh', parts: [{ text: ' ⟳ Refresh ' }] },
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
  const props: ListProps = {
    width: inner,
    rows: m.list,
    colors: { bg: C.sidebar, hover: C.hover, pressed: C.pressed, selected: C.selected, accent: C.accent, fg: C.fg, muted: C.muted, subtle: C.subtle, on: C.on, onBg: C.onBg, offBg: C.offBg },
  }
  const empty = m.isLoaded ? (m.filter === 'mods' ? 'No mods installed. All shows every plugin.' : 'No plugins installed.') : 'Reading the installed plugins…'
  const body =
    m.listTotal === 0 ? (
      <Box flexDirection="column" width={inner}>
        <Text backgroundColor={C.sidebar}>{' '.repeat(inner)}</Text>
        <Text backgroundColor={C.sidebar} color={C.muted}>
          {pad(`  ${truncate(empty, inner - 3)}`, inner)}
        </Text>
      </Box>
    ) : Client ? (
      <Client key="list" module="./list-client.tsx" props={props} width={inner} height={m.at.listRows} />
    ) : (
      <Box flexDirection="column" width={inner}>
        {m.list.map(row =>
          row.kind === 'group' ? (
            <Text backgroundColor={C.sidebar} color={C.muted}>
              {pad(` ${row.label}`, inner)}
            </Text>
          ) : (
            <Text backgroundColor={row.isSelected ? C.selected : C.sidebar} color={row.isOn ? C.fg : C.muted}>
              {pad(` ${row.isOn ? '●' : '○'} ${row.name} ${row.version}`, inner - 5)}
              {row.isOn ? ' ON  ' : ' OFF '}
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

const MD_COLOR: Record<MdRow['style'], { color: string; bg?: string; bold?: boolean }> = {
  h1: { color: C.heading, bold: true },
  h2: { color: C.heading, bold: true },
  h3: { color: C.text, bold: true },
  text: { color: C.text },
  bullet: { color: C.text },
  quote: { color: C.muted },
  code: { color: C.code, bg: C.codeBg },
  rule: { color: C.border },
  blank: { color: C.text },
}

function DetailColumn({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  const w = m.at.detailWidth
  const inner = w - 1
  if (!m.detail) {
    return (
      <Box flexDirection="column" width={w} height={m.at.detailHeight} backgroundColor={C.canvas}>
        <Text backgroundColor={C.canvas}>{' '.repeat(w)}</Text>
        <Text backgroundColor={C.canvas} color={C.muted}>
          {pad('  Pick a plugin on the left.', w)}
        </Text>
      </Box>
    )
  }
  const { entry, isSelf } = m.detail
  const head = detailHead(m.detail, w)
  const scope = entry.scope === 'session' ? 'this session (dev folder)' : `${entry.scope} scope`
  const kind = entry.isMod ? 'mod · hooks module' : 'plugin · no hooks module'
  const switchItem: Item = isSelf || entry.scope === 'session'
    ? text([{ text: isSelf ? ' always on ' : ' on for this session ', color: C.subtle }])
    : { action: 'toggle', parts: [entry.enabled ? { text: ' ● Enabled ', color: C.on, bg: C.onBg, bold: true } : { text: ' ○ Disabled ', color: C.muted, bg: C.offBg, bold: true }] }
  const headItems: Item[] = [
    text([
      { text: entry.name, color: C.fg, bold: true },
      { text: `  v${entry.version || '?'}`, color: C.muted },
      ...(entry.marketplace ? [{ text: `  @${entry.marketplace}`, color: C.subtle }] : []),
    ]),
    spacer,
    switchItem,
    text([{ text: ' ' }]),
  ]
  const commands = commandLines(entry, w)
  const readmeRows = m.at.detailHeight - head.rows - 1
  const readme = m.detail.readme.slice(m.detailOffset, m.detailOffset + Math.max(0, readmeRows))
  const footItems: Item[] = m.note
    ? [text([{ text: truncate(m.note, Math.max(4, w - (m.needsReload ? 16 : 4))), color: C.warn }]), spacer, ...(m.needsReload ? [{ action: 'reload', parts: [{ text: ' ⟳ Reload ', color: C.fg }] } as Item] : [])]
    : [
        text([{ text: m.detail.readme.length > 0 ? `README  ${Math.min(m.detail.readme.length, m.detailOffset + 1)}–${Math.min(m.detail.readme.length, m.detailOffset + Math.max(0, readmeRows))}/${m.detail.readme.length}` : 'No README', color: C.muted }]),
        spacer,
        ...(m.needsReload ? [{ action: 'reload', parts: [{ text: ' ⟳ Reload to apply ', color: C.warn }] } as Item, text([{ text: ' ' }])] : []),
        { action: 'up', parts: [{ text: ' ▲ ' }] },
        { action: 'down', parts: [{ text: ' ▼ ' }] },
      ]
  return (
    <Box flexDirection="column" width={w} height={m.at.detailHeight} overflow="hidden" backgroundColor={C.canvas}>
      <ChromeRow m={m} id="dhead" w={w} bg={C.canvas} items={headItems} />
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(w)}
      </Text>
      <Text backgroundColor={C.canvas} color={C.muted}>
        {pad(`  ${truncate(`${kind} · ${scope}`, w - 3)}`, w)}
      </Text>
      {head.description.map(line => (
        <Text backgroundColor={C.canvas} color={C.text}>
          {pad(`  ${line}`, w)}
        </Text>
      ))}
      <Text backgroundColor={C.canvas}>{' '.repeat(w)}</Text>
      <Text backgroundColor={C.canvas} color={C.muted} weight="bold">
        {pad(entry.enabled ? '  PANELS & COMMANDS' : '  PANELS & COMMANDS (enable it to use them)', w)}
      </Text>
      {commands.length === 0 ? (
        <Text backgroundColor={C.canvas} color={C.subtle}>
          {pad(entry.enabled ? '  No slash commands.' : '  —', w)}
        </Text>
      ) : (
        commands.map((line, i) => <ChromeRow m={m} id={`dcmd${i}`} w={w} bg={C.canvas} items={line} />)
      )}
      <Text color={C.border} backgroundColor={C.canvas}>
        {'─'.repeat(w)}
      </Text>
      <Box flexDirection="row" width={w} height={Math.max(0, readmeRows)} backgroundColor={C.canvas}>
        <Box flexDirection="column" width={inner} height={Math.max(0, readmeRows)} overflow="hidden" backgroundColor={C.canvas}>
          {readme.map(row => {
            const look = MD_COLOR[row.style]
            const body = row.style === 'rule' ? '─'.repeat(Math.max(0, inner - 4)) : row.text
            return (
              <Text backgroundColor={C.canvas} wrap="truncate-end">
                <Text>{'  '}</Text>
                <Text color={look.color} backgroundColor={look.bg ?? C.canvas} weight={look.bold ? 'bold' : undefined}>
                  {row.style === 'code' ? pad(body, inner - 3) : body}
                </Text>
                <Text>{' '.repeat(Math.max(0, inner - 2 - textWidth(row.style === 'code' ? pad(body, inner - 3) : body)))}</Text>
              </Text>
            )
          })}
        </Box>
        {readmeRows > 0 && (
          <Bar m={m} id="dbar" length={readmeRows} total={m.detail.readme.length} view={readmeRows} offset={m.detailOffset} bg={C.canvas} />
        )}
      </Box>
      <ChromeRow m={m} id="dfoot" w={w} bg={C.header} items={footItems} />
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
      <DetailColumn m={m} />
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
      <DetailColumn m={m} />
    </Box>
  )
  return (
    <Box flexDirection="column" width={m.at.width} height={m.at.height} overflow="hidden" backgroundColor={C.canvas}>
      <Toolbar m={m} />
      {columns}
    </Box>
  )
}
