// tool-fold: each tool call as one quiet line, its result folded away.
//   `▸ ● Bash  npm test            12 lines`: the call's state in the dot (running, done, failed),
//   the tool, what it acted on, and how it went (lines printed, +adds −dels, an error's first line).
//   A click on the line unfolds it: the engine's own result block shows under it, until clicked again.
//   Rows fold under verbose and in ctrl+o too, unless the yieldExpanded option leaves those to the
//   engine. /tools toggles the mod (kept across sessions);
//   /tools expand and /tools collapse unfold or fold every call.
//   /tools panel opens a pane of every call beside the chat, each shown in a view that suits its
//   tool (./panel-hooks.tsx); while it is up, a click on a line shows that call there instead.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { panelCommand, registerPanel, setPlace, showInPanel } from './panel-hooks'
import type { RowProps } from './row-client'
import { meta, status, subject, toolName } from './summary'
import type { Tone } from './summary'
import { textWidth, truncate } from './text'

const GUTTER = 2 // the engine keeps a column clear at each edge of the transcript
const TOOL_COLUMN = 8 // tool names padded to this, so the subjects line up in a column
const FALLBACK_COLUMNS = 120
const STORE_KEY = 'enabled'

const enabled = atom({ plugin: 'tool-fold', key: 'enabled' } as const, true)
const unfoldAll = atom({ plugin: 'tool-fold', key: 'unfoldAll' } as const, false)
const flipped = atom({ plugin: 'tool-fold', key: 'flipped' } as const, [] as string[])

const session = { cwd: '', home: '', command: 'tools' }
// What the ToolUse and ToolResult sites asked this session, and why a row was left to the engine.
const seen = { use: 0, folded: 0, result: 0, hidden: 0, passed: new Map<string, number>(), last: '' }
const pass = (why: string) => seen.passed.set(why, (seen.passed.get(why) ?? 0) + 1)

function stats() {
  const why = [...seen.passed.entries()].map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'
  return [
    `Tool rows asked: ${seen.use}, drawn folded: ${seen.folded}. Result blocks asked: ${seen.result}, hidden: ${seen.hidden}.`,
    `Left to the engine: ${why}.`,
    seen.last ? `Last row: ${seen.last}` : 'No tool row has been drawn since the mod loaded.',
  ].join('\n')
}

const TONE: Record<Tone, string> = { ok: '#3fb950', muted: '#8b949e', error: '#f85149', add: '#3fb950', del: '#f85149', warn: '#d29922' }
const DOT = { running: { glyph: '◐', color: '#d29922' }, done: { glyph: '●', color: '#3fb950' }, error: { glyph: '●', color: '#f85149' }, interrupted: { glyph: '○', color: '#f85149' } }

function toolColor(tool: string) {
  if (tool === 'Bash') return '#7ee787'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return '#79c0ff'
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return '#ffa657'
  if (tool === 'Agent' || tool === 'Task') return '#d2a8ff'
  if (/^Web/.test(tool)) return '#a5d6ff'
  if (tool.startsWith('mcp__')) return '#8b949e'
  return '#e6edf3'
}

// Unfolded: under /tools expand every call not folded back; otherwise the ones clicked open.
async function isOpen($: EngineInterface, id: string) {
  const all = await read($, unfoldAll)
  const list = await read($, flipped)
  return all !== list.includes(id)
}

async function toggleOne($: EngineInterface, id: string) {
  await update($, flipped, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id].slice(-500)))
}

async function command($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (arg === 'stats') return { text: stats() }
  if (arg === 'panel' || arg.startsWith('panel ')) return panelCommand($, arg.slice(5).trim())
  if (arg === 'expand' || arg === 'collapse') {
    await update($, unfoldAll, () => arg === 'expand')
    await update($, flipped, () => [])
    return { text: arg === 'expand' ? 'Every tool call unfolded. Click a line to fold it.' : 'Every tool call folded. Click a line to unfold it.' }
  }
  const on = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabled))
  await update($, enabled, () => on)
  await $.store.set(STORE_KEY, on).catch(() => undefined)
  return { text: on ? `Tool calls folded to one line. /${session.command} turns it off.` : `Tool calls drawn by the engine again. /${session.command} turns folding back on.` }
}

export const register: Register = (on, options) => {
  // With verbose on, the engine marks every row expanded; folding would never happen if that
  // handed rows back. Only where the person asks for it are expanded rows left to the engine.
  const yieldExpanded = options.yieldExpanded === true
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    session.cwd = e.cwd
    session.home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    setPlace(session.cwd, session.home)
    const stored = await $.store.get(STORE_KEY).catch(() => undefined)
    if (typeof stored === 'boolean') await update($, enabled, () => stored)
    for (const name of ['tools', 'tool-fold']) {
      const ok = await $.command
        .register({ name, description: 'Fold tool calls to one line, or not; expand or collapse them all', argumentHint: '[on | off | panel | expand | collapse | stats]' })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        session.command = name
        break
      }
    }
    return r
  })

  registerPanel(on)

  on('command.run', { command: 'tools' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'tool-fold' }, async ($, e) => command($, e.args))

  // A click on a line, posted by its surface module.
  on('ui.message', { module: 'hooks/row-client.tsx' }, async ($, e) => {
    const id = (e.data as { toggle?: unknown } | null)?.toggle
    if (typeof id === 'string' && !(await showInPanel($, id))) await toggleOne($, id)
    return {}
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    seen.use++
    seen.last = `${e.props.tool} on ${e.surface}, isExpanded ${String(e.props.isExpanded)}, viewport ${e.viewport?.columns ?? '?'} columns`
    if (e.surface !== 'terminal') return pass(`surface ${e.surface}`), next(e)
    if (e.props.isExpanded && yieldExpanded) return pass('isExpanded (ctrl+o or verbose)'), next(e)
    if (!(await read($, enabled))) return pass('turned off'), next(e)
    seen.folded++
    const { Box, Text, Client } = $.ui.resolve(e)
    const width = Math.max(30, (e.viewport?.columns ?? FALLBACK_COLUMNS) - GUTTER)
    const open = await isOpen($, e.props.tool_use_id)
    const state = status(e.props)
    // +adds and −dels read as one figure; other facts are set apart by a dot.
    const parts = meta(e.props).map((p, i, all) => ({ text: p.text, color: TONE[p.tone], sep: p.tone === 'del' && all[i - 1]?.tone === 'add' ? ' ' : ' · ' }))
    const name = toolName(e.props.tool)
    const tool = name + ' '.repeat(Math.max(0, TOOL_COLUMN - textWidth(name)))
    // How it went gets at most a quarter of the line, so a long error never crowds out the subject.
    const capped = parts.map(p => ({ ...p, text: truncate(p.text, Math.max(10, Math.floor(width / 4))) }))
    const metaWidth = capped.reduce((n, p, i) => n + textWidth(p.text) + (i > 0 ? p.sep.length : 0), 0)
    // The subject is the only part cut, so the tool and how it went stay readable.
    const room = width - (2 + 2 + textWidth(tool) + 2) - metaWidth - 3
    const props: RowProps = {
      id: e.props.tool_use_id,
      width,
      isOpen: open,
      dot: DOT[state],
      tool,
      toolColor: toolColor(e.props.tool),
      subject: truncate(subject(e.props, session.cwd, session.home), Math.max(16, room)),
      meta: capped,
      colors: { hover: '#161b22', chevron: '#6e7681', text: '#c9d1d9', sep: '#484f58' },
    }
    if (Client) return <Client key={`row-${e.props.tool_use_id}`} module="./row-client.tsx" props={props} width={width} height={1} />
    return (
      <Box>
        <Text>
          <Text color={props.dot.color}>{props.dot.glyph} </Text>
          <Text color={props.toolColor} weight="bold">
            {name}
          </Text>
          <Text color="#c9d1d9">{`  ${props.subject}  `}</Text>
          <Text color="#8b949e">{parts.map(p => p.text).join(' · ')}</Text>
        </Text>
      </Box>
    )
  })

  // Folded, the line already says what the result block would; unfolded, the engine draws it.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    seen.result++
    if (e.surface !== 'terminal' || (e.props.isExpanded && yieldExpanded) || !(await read($, enabled))) return next(e)
    if (await isOpen($, e.props.tool_use_id)) return next(e)
    seen.hidden++
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
