// What the pane draws: a toolbar, the explorer on the left and the preview on the right, each
// column a window of its own over its rows, so the two scroll apart as in VS Code. The chrome rows
// and their controls are in chrome.tsx; this file lays the columns out.
import type { Elements } from 'claude-code'

import { ExplorerHead, FileHead, StatusRow, Toolbar } from './chrome'
import { chevron, fileIcon, folderIcon } from './icons'
import type { IconStyle } from './icons'
import { PreviewRow } from './rows'
import type { VRow } from './rows'
import { thumbOf } from './scrollbar'
import type { BarProps } from './scrollbar'
import { pad, textWidth, truncate } from './text'
import { C } from './theme'
import type { TreeRow } from './tree'
import type { TreeItem, TreeProps } from './tree-client'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Code'> & {
  Client?: Elements['terminal']['Client'] // the terminal and desktop draw one; the others fall back to Buttons
}

export type Status = 'A' | 'M' | 'D'

export type Entry = {
  path: string
  rel: string
  name: string
  status: Status
  adds: number
  dels: number
  isSame: boolean // back to how it was
  isTooBig: boolean
}

export type Layout = {
  width: number
  height: number
  showTree: boolean
  treeWidth: number
  previewWidth: number
  treeBody: number // rows the tree's window shows
  previewBody: number // rows the preview's window shows
  treeInner: number // the tree's columns left of its scrollbar
  previewInner: number // the preview's columns left of its scrollbar
  hasHbar: boolean // lines are not wrapped, so the preview scrolls sideways and shows a bar for it
}

export type Handlers = {
  pick: (path: string) => void
  toggle: (dirKey: string) => void
  collapseAll: () => void
  next: () => void
  prev: () => void
  view: () => void
  wrap: () => void
  tree: () => void
  down: () => void
  up: () => void
  left: () => void
  right: () => void
}

const TOOLBAR_ROWS = 2 // the toolbar and the rule under it
const TREE_HEAD = 1 // the explorer's title row
const PREVIEW_HEAD = 2 // the file's header and the rule under it
const PREVIEW_FOOT = 1 // the status row under the preview
const TREE_MIN_PANE = 72 // narrower panes hide the tree unless it is forced on

export function layout(width: number, height: number, tree: 'auto' | 'shown' | 'hidden', hasHbar: boolean): Layout {
  const showTree = tree === 'shown' || (tree === 'auto' && width >= TREE_MIN_PANE)
  const treeWidth = showTree ? Math.max(20, Math.min(36, Math.round(width * 0.32))) : 0
  const previewWidth = showTree ? width - treeWidth - 1 : width
  const body = Math.max(1, height - TOOLBAR_ROWS)
  return {
    width,
    height,
    showTree,
    treeWidth,
    previewWidth,
    treeBody: Math.max(1, body - TREE_HEAD),
    previewBody: Math.max(1, body - PREVIEW_HEAD - PREVIEW_FOOT - (hasHbar ? 1 : 0)),
    treeInner: Math.max(1, treeWidth - 1),
    previewInner: Math.max(1, previewWidth - 1),
    hasHbar,
  }
}

export const statusColor = (s: Status) => (s === 'A' ? C.gitAdded : s === 'D' ? C.gitDeleted : C.gitModified)

export type PaneModel = {
  els: Els
  at: Layout
  icons: IconStyle
  entries: Entry[]
  tree: TreeRow[]
  canCollapse: boolean // some folder is open, so collapse all would close it
  selected: Entry | null
  position: number // the selected file's place among the files, 1-based
  view: 'diff' | 'file'
  isWrapped: boolean
  rows: VRow[] // the preview's rows in diff view
  code: { source: string; startLine: number } | null // the preview's window in file view
  previewTotal: number // rows (diff) or lines (file) the preview holds
  wideTotal: number // the widest line's cells, for the sideways bar
  wideView: number // the cells of a line the window shows
  scroll: { tree: number; preview: number; x: number }
  on: Handlers
}

const BAR_COLORS = { track: C.track, thumb: C.thumb, active: C.thumbActive, bg: C.canvas }

// A scrollbar: a Client the pointer drags where the surface draws one, else a picture of one.
function Bar({ m, id, axis, length, total, view, offset, bg }: {
  m: PaneModel
  id: 'vbar' | 'hbar' | 'tbar'
  axis: 'v' | 'h'
  length: number
  total: number
  view: number
  offset: number
  bg: string
}) {
  const { Box, Text, Client } = m.els
  const props: BarProps = { axis, length, total, view, offset, colors: { ...BAR_COLORS, bg } }
  if (Client) {
    return axis === 'v' ? (
      <Client key={id} module="./scrollbar.tsx" props={props} width={1} height={length} />
    ) : (
      <Client key={id} module="./scrollbar.tsx" props={props} width={length} height={1} />
    )
  }
  const { start, size, max } = thumbOf(props)
  const isThumb = (i: number) => max > 0 && i >= start && i < start + size
  if (axis === 'v') {
    return (
      <Box flexDirection="column" width={1}>
        {Array.from({ length }, (_, i) => (
          <Text color={isThumb(i) ? C.thumb : C.track} backgroundColor={bg}>
            {isThumb(i) ? '┃' : '│'}
          </Text>
        ))}
      </Box>
    )
  }
  return (
    <Text backgroundColor={bg}>
      {Array.from({ length }, (_, i) => (
        <Text color={isThumb(i) ? C.thumb : C.track}>{isThumb(i) ? '━' : '─'}</Text>
      ))}
    </Text>
  )
}

function treeItems(m: PaneModel, rows: TreeRow[], width: number): TreeItem[] {
  const byPath = new Map(m.entries.map(e => [e.path, e]))
  return rows.map(row => {
    const lead = ' '.repeat(1 + row.depth * 2) + (row.kind === 'dir' ? `${chevron(row.isOpen, m.icons)} ` : '  ')
    if (row.kind === 'dir') {
      const icon = folderIcon(row.name, row.isOpen, m.icons)
      return {
        key: row.key,
        kind: 'dir',
        lead,
        glyph: icon.glyph,
        glyphColor: icon.color,
        name: truncate(row.name, width - textWidth(lead) - 3),
        nameColor: C.fg,
        status: '',
        statusColor: C.muted,
        isSelected: false,
        isStruck: false,
      }
    }
    const entry = byPath.get(row.path)
    const status = entry?.status ?? 'M'
    const icon = fileIcon(row.name, m.icons)
    const color = entry?.isSame ? C.subtle : statusColor(status)
    return {
      key: row.path,
      kind: 'file',
      lead,
      glyph: icon.glyph,
      glyphColor: icon.color,
      name: truncate(row.name, width - textWidth(lead) - 7),
      nameColor: color,
      status: ` ${status} `,
      statusColor: color,
      isSelected: m.selected?.path === row.path,
      isStruck: status === 'D',
    }
  })
}

// Where no Client is drawn (VS Code, mobile): each row a plain Button.
function TreeButtons({ m, items, width }: { m: PaneModel; items: TreeItem[]; width: number }) {
  const { Button, Text } = m.els
  return (
    <>
      {items.map(item => {
        const bg = item.isSelected ? C.selected : C.sidebar
        const used = textWidth(item.lead) + 1 + textWidth(item.name) + textWidth(item.status)
        const press = () => (item.kind === 'dir' ? m.on.toggle(item.key) : m.on.pick(item.key))
        return (
          <Button key={`${item.kind}:${item.key}`} plain onPress={press}>
            <Text backgroundColor={bg} color={C.muted}>
              {item.lead}
            </Text>
            <Text backgroundColor={bg} color={item.glyphColor}>
              {item.glyph}
            </Text>
            <Text backgroundColor={bg} color={item.nameColor} strikethrough={item.isStruck}>
              {` ${item.name}${' '.repeat(Math.max(1, width - used - 1))}`}
            </Text>
            <Text backgroundColor={bg} color={item.statusColor}>
              {item.status}
            </Text>
          </Button>
        )
      })}
    </>
  )
}

function TreeColumn({ m }: { m: PaneModel }) {
  const { Box, Text, Client } = m.els
  const w = m.at.treeWidth
  const shown = m.tree.slice(m.scroll.tree, m.scroll.tree + m.at.treeBody)
  const items = treeItems(m, shown, m.at.treeInner)
  const props: TreeProps = {
    width: m.at.treeInner,
    rows: items,
    colors: { bg: C.sidebar, hover: C.hover, selected: C.selected, accent: C.accent },
  }
  return (
    <Box flexDirection="column" width={w} height={m.at.treeBody + TREE_HEAD} overflow="hidden" backgroundColor={C.sidebar}>
      <ExplorerHead m={m} />
      <Box flexDirection="row" width={w} height={m.at.treeBody} backgroundColor={C.sidebar}>
        <Box flexDirection="column" width={m.at.treeInner} height={m.at.treeBody} backgroundColor={C.sidebar}>
          {Client ? (
            <Client key="explorer" module="./tree-client.tsx" props={props} width={m.at.treeInner} height={m.at.treeBody} />
          ) : (
            <TreeButtons m={m} items={items} width={m.at.treeInner} />
          )}
        </Box>
        <Bar m={m} id="tbar" axis="v" length={m.at.treeBody} total={m.tree.length} view={m.at.treeBody} offset={m.scroll.tree} bg={C.sidebar} />
      </Box>
    </Box>
  )
}

function Divider({ m }: { m: PaneModel }) {
  const { Box, Text } = m.els
  return (
    <Box flexDirection="column" width={1}>
      {Array.from({ length: m.at.treeBody + TREE_HEAD }, () => (
        <Text color={C.border} backgroundColor={C.canvas}>
          │
        </Text>
      ))}
    </Box>
  )
}

function PreviewColumn({ m }: { m: PaneModel }) {
  const { Box, Text, Code } = m.els
  const w = m.at.previewWidth
  const tall = m.at.previewBody + PREVIEW_HEAD + PREVIEW_FOOT + (m.at.hasHbar ? 1 : 0)
  if (!m.selected) {
    const lines = ['', '  No changes yet.', '', '  Files Claude edits this session', '  show up here, with their diff.']
    return (
      <Box flexDirection="column" width={w} height={tall} backgroundColor={C.canvas}>
        {lines.map((line, i) => (
          <Text backgroundColor={C.canvas} color={i === 1 ? C.fg : C.muted}>
            {pad(line, w)}
          </Text>
        ))}
      </Box>
    )
  }
  const inner = m.at.previewInner
  const content =
    m.view === 'file' && m.code ? (
      <Box width={inner} height={m.at.previewBody} overflow="hidden" backgroundColor={C.canvas}>
        <Code source={m.code.source || ' '} path={m.selected.path} startLine={m.code.startLine} wrap="truncate-end" />
      </Box>
    ) : (
      <Box flexDirection="column" width={inner} height={m.at.previewBody} overflow="hidden" backgroundColor={C.canvas}>
        {m.rows.slice(m.scroll.preview, m.scroll.preview + m.at.previewBody).map(row => (
          <PreviewRow els={m.els} row={row} width={inner} x={m.at.hasHbar ? m.scroll.x : 0} />
        ))}
      </Box>
    )
  const body = (
    <Box flexDirection="column" width={w} backgroundColor={C.canvas}>
      <Box flexDirection="row" width={w} height={m.at.previewBody} backgroundColor={C.canvas}>
        {content}
        <Bar m={m} id="vbar" axis="v" length={m.at.previewBody} total={m.previewTotal} view={m.at.previewBody} offset={m.scroll.preview} bg={C.canvas} />
      </Box>
      {m.at.hasHbar && (
        <Box flexDirection="row" width={w} height={1} backgroundColor={C.canvas}>
          <Bar m={m} id="hbar" axis="h" length={inner} total={m.wideTotal} view={m.wideView} offset={m.scroll.x} bg={C.canvas} />
          <Text backgroundColor={C.canvas}> </Text>
        </Box>
      )}
    </Box>
  )
  return (
    <Box flexDirection="column" width={w} height={tall} overflow="hidden" backgroundColor={C.canvas}>
      <FileHead m={m} />
      {body}
      <StatusRow m={m} />
    </Box>
  )
}

export function Pane({ m }: { m: PaneModel }) {
  const { Box } = m.els
  return (
    <Box flexDirection="column" width={m.at.width} height={m.at.height} overflow="hidden" backgroundColor={C.canvas}>
      <Toolbar m={m} />
      <Box flexDirection="row" width={m.at.width} overflow="hidden" backgroundColor={C.canvas}>
        {m.at.showTree && <TreeColumn m={m} />}
        {m.at.showTree && <Divider m={m} />}
        <PreviewColumn m={m} />
      </Box>
    </Box>
  )
}
