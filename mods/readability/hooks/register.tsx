// readability: Claude's replies drawn for reading.
//   Body text a step softer than white, headings by level, inline code and links that stand out,
//   code blocks on a panel with syntax colors, tables with borders, quotes with a bar.
//   The layout keeps the engine's flow (same indent, same blank lines, same wrapping), so when a
//   reply's drawing switches from the engine's to this one nothing moves but the colors; and every
//   prefix of a reply parses, so a reply drawn while it streams is styled as it grows.
//   /readability toggles it (remembered across sessions); /readability stats shows how replies
//   were drawn this session.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Line, Span } from './layout'
import { layoutBlocks } from './layout'
import { parseBlocks } from './markdown'
import { T } from './theme'

const GUTTER = 2 // the engine keeps a column clear at each edge of the transcript
const INDENT = 2 // a reply's text sits two cells in, its bullet in that margin
const FALLBACK_COLUMNS = 120 // before the terminal has been measured
const CACHE_SIZE = 300
const STORE_KEY = 'enabled'

// Held by the host, so a hot reload keeps it; mirrored to $.store so a new session starts the same.
const enabled = atom({ plugin: 'readability', key: 'enabled' } as const, true)

// The module's own bookkeeping; a reload starts it over.
const session = { command: 'readability' }
const drawings = new Map<string, Line[]>() // laid-out lines by width and text, oldest first
// How each reply block was drawn: how many times, and how long its text was the first and last time.
const seen = new Map<string, { draws: number; firstLength: number; lastLength: number }>()

function linesFor(text: string, width: number): Line[] {
  const key = `${width}\u0000${text}`
  const kept = drawings.get(key)
  if (kept) {
    drawings.delete(key)
    drawings.set(key, kept)
    return kept
  }
  const lines = layoutBlocks(parseBlocks(text), width)
  drawings.set(key, lines)
  if (drawings.size > CACHE_SIZE) drawings.delete(drawings.keys().next().value!)
  return lines
}

function note(requestId: string, length: number) {
  const s = seen.get(requestId)
  if (s) seen.set(requestId, { draws: s.draws + 1, firstLength: s.firstLength, lastLength: length })
  else seen.set(requestId, { draws: 1, firstLength: length, lastLength: length })
  if (seen.size > 500) seen.delete(seen.keys().next().value!)
}

function stats() {
  const all = [...seen.values()]
  const grew = all.filter(s => s.lastLength > s.firstLength)
  const draws = all.reduce((n, s) => n + s.draws, 0)
  return [
    `${all.length} reply blocks drawn ${draws} times this session.`,
    grew.length > 0
      ? `${grew.length} of them were drawn while their text was still growing: replies are styled as they stream.`
      : 'None was drawn while its text was still growing: the engine draws a reply here once it is whole, so the styling arrives then (its layout matches the streamed text, so nothing moves).',
  ].join('\n')
}

async function setEnabled($: EngineInterface, on: boolean) {
  await update($, enabled, () => on)
  await $.store.set(STORE_KEY, on).catch(() => undefined)
}

async function command($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (arg === 'stats') return { text: stats() }
  const next = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabled))
  await setEnabled($, next)
  return {
    text: next
      ? `Readable replies on. /${session.command} turns them off.`
      : `Readable replies off: the engine draws replies. /${session.command} turns them back on.`,
  }
}

export const register: Register = (on, options) => {
  const maxColumns = typeof options.maxColumns === 'number' ? options.maxColumns : 100

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const stored = await $.store.get(STORE_KEY).catch(() => undefined)
    if (typeof stored === 'boolean') await update($, enabled, () => stored)
    for (const name of ['readability', 'readable']) {
      const ok = await $.command
        .register({ name, description: 'Turn readable replies on or off', argumentHint: '[on | off | stats]' })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        session.command = name
        break
      }
    }
    return r
  })

  on('command.run', { command: 'readability' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'readable' }, async ($, e) => command($, e.args))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // A summary keeps the engine's faint "· summary" mark, which a tree of the mod's own would drop.
    if (e.surface !== 'terminal' || e.props.isSummary || !(await read($, enabled))) return next(e)
    note(e.requestId, e.props.text.length)
    const columns = (e.viewport?.columns ?? FALLBACK_COLUMNS) - GUTTER - INDENT
    const width = Math.max(20, maxColumns > 0 ? Math.min(columns, maxColumns) : columns)
    const lines = linesFor(e.props.text, width)
    if (lines.length === 0) return next(e)

    const { Box, Text, Link } = $.ui.resolve(e)
    const draw = (span: Span) => {
      const text = <Text {...span.paint}>{span.text}</Text>
      return span.href === undefined ? text : <Link href={span.href}>{text}</Link>
    }
    const lead = (i: number) =>
      i === 0 && e.props.isFirstOfReply ? <Text color={T.strong}>{'● '}</Text> : <Text>{'  '}</Text>
    return (
      <Box flexDirection="column" marginTop={1}>
        {lines.map((line, i) => (
          <Text>
            {lead(i)}
            {line.length === 0 ? ' ' : line.map(draw)}
          </Text>
        ))}
      </Box>
    )
  })
}
