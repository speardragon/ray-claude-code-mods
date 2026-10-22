// prompt-history: the prompts the person typed this session, in a pane beside the chat.
//   Left, the list: a heading per day, each prompt's number, its text cut to the row and how long
//   ago it was sent (ko: 3분 전, en: 3m ago, a date after a week). Right, the picked prompt in
//   full (the newest until one is picked), with its own scrollbar. Hovering only lights a row.
//   A click or Enter jumps the transcript to that prompt; /prompts opens the pane, /prompts <n>
//   jumps to the nth prompt. Prompts already sent are read from the transcript file when the mod
//   loads; new ones arrive through session.append.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Locale, Prompt, Scroll } from '../types'
import type { ListRow } from './list-client'
import { textWidth, truncate, wrapText } from './text'
import { clock, date, dayLabel, parseOffset, relative, sameDay } from './time'
import { HUMAN_MARK, parseTranscript, promptText, transcriptPath } from './transcript'
import { keyStep } from './keys'
import { layout, Pane } from './view'
import type { Action, Layout, Shown } from './view'

const PANE = 'prompt-history'
const TITLE = 'Prompts'
const TICK_MS = 30_000 // how often "3분 전" is brought up to date
const DOCK_COLUMNS = 110
const FOLLOW = -1 // the list's offset while it keeps the newest prompt in view
const PEOPLE = new Set(['composer', 'bridge']) // origins of a prompt a person typed

// Held by the host, so a hot reload keeps them.
const prompts = atom({ plugin: 'prompt-history', key: 'prompts' } as const, [] as Prompt[])
const selected = atom({ plugin: 'prompt-history', key: 'selected' } as const, null as string | null)
const scroll = atom({ plugin: 'prompt-history', key: 'scroll' } as const, { list: FOLLOW, preview: 0, previewFor: null } as Scroll)
const locale = atom({ plugin: 'prompt-history', key: 'locale' } as const, null as Locale | null)
const now = atom({ plugin: 'prompt-history', key: 'now' } as const, 0)
const tzOffset = atom({ plugin: 'prompt-history', key: 'tzOffset' } as const, -new Date().getTimezoneOffset())
const note = atom({ plugin: 'prompt-history', key: 'note' } as const, '')

// The module's own bookkeeping; a reload starts it over.
const session = { command: 'prompts', locale: 'ko' as Locale }
const drawn = { layout: null as Layout | null, listTotal: 0, previewTotal: 0, order: [] as string[], shown: null as string | null }
const wrapped = new Map<string, { width: number; text: string; rows: string[] }>()

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const merge = (a: Prompt[], b: Prompt[]) => {
  const byId = new Map([...a, ...b].map(p => [p.uuid, p]))
  return [...byId.values()].sort((x, y) => x.at - y.at)
}

// The prompts in the transcript file so far, picked out by grep (the file outgrows $.fs.read).
async function loadTranscript($: EngineInterface, cwd: string) {
  const id = await $.session.id()
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) ?? `${(await $.env.get('HOME').catch(() => undefined)) ?? ''}/.claude`
  const path = transcriptPath(configDir, cwd, id)
  const run = await $.process.run(['grep', '-F', HUMAN_MARK, path]).catch(() => null)
  if (!run || run.exitCode > 1) return
  const found = parseTranscript(run.stdout)
  await update($, prompts, list => merge(list, found))
}

async function loadTimezone($: EngineInterface) {
  const run = await $.process.run(['date', '+%z']).catch(() => null)
  const offset = run ? parseOffset(run.stdout) : null
  if (offset !== null) await update($, tzOffset, () => offset)
}

function rowsOf(prompt: Prompt, width: number): string[] {
  const kept = wrapped.get(prompt.uuid)
  if (kept && kept.width === width && kept.text === prompt.text) return kept.rows
  const rows = prompt.text.split('\n').flatMap(line => wrapText(line, width))
  wrapped.set(prompt.uuid, { width, text: prompt.text, rows })
  return rows
}

// Brings the transcript to a prompt. The engine moves the transcript only while a hook answers the
// person's own input, through that hook's own `$`: a Button press (the `ui.press` hook below) or a
// command they typed. A click a surface module posts is not one, nor is a closure drawn at render.
// So the scroll goes first, before anything else is awaited.
async function jump($: EngineInterface, uuid: string) {
  const moved = await $.ui.scroll({ to: { requestId: uuid }, block: 'start' }).catch((error: unknown) => ({
    deny: error instanceof Error ? error.message : String(error),
  }))
  await select($, uuid)
  await update($, note, () => (moved.deny ? `↗ ${moved.deny}` : ''))
  return moved
}

async function select($: EngineInterface, uuid: string) {
  await update($, selected, () => uuid)
  await update($, scroll, s => ({ ...s, preview: 0, previewFor: uuid }))
  await update($, note, () => '')
}

// Puts a prompt's text on the clipboard of the surface the press came from.
async function copy($: EngineInterface, uuid: string, surface: RenderSurface) {
  const prompt = (await read($, prompts)).find(p => p.uuid === uuid)
  if (!prompt) return
  const ko = ((await read($, locale)) ?? session.locale) === 'ko'
  const done = await $.ui.copy({ text: prompt.text, surface }).catch((error: unknown) => ({
    isCopied: false as const,
    reason: error instanceof Error ? error.message : String(error),
  }))
  const no = drawn.order.indexOf(uuid) + 1
  await update($, note, () =>
    done.isCopied
      ? ko ? `✓ #${no} 복사됨 (${prompt.text.length.toLocaleString('en-US')}자)` : `✓ Copied #${no} (${prompt.text.length.toLocaleString('en-US')} chars)`
      : ko ? `복사 못 함: ${done.reason}` : `Could not copy: ${done.reason}`,
  )
}

// Keeps the picked prompt inside the list's window.
async function reveal($: EngineInterface, uuid: string) {
  const at = drawn.layout
  if (!at) return
  const index = drawn.order.indexOf(uuid)
  if (index < 0) return
  // Rows above it in the list: its own place plus one heading per day so far.
  const list = await read($, prompts)
  const offset = await read($, tzOffset)
  const row = list.slice(0, index + 1).reduce((n, p, i) => n + 1 + (i === 0 || !sameDay(list[i - 1]!.at, p.at, offset) ? 1 : 0), -1)
  await update($, scroll, s => {
    const top = s.list === FOLLOW ? Math.max(0, drawn.listTotal - at.listRows) : s.list
    const next = row < top ? row - 1 : row >= top + at.listRows ? row - at.listRows + 1 : top
    return { ...s, list: clamp(next, 0, Math.max(0, drawn.listTotal - at.listRows)) }
  })
}

async function pick($: EngineInterface, by: number) {
  const order = drawn.order
  if (order.length === 0) return
  const current = (await read($, selected)) ?? drawn.shown
  const at = current ? order.indexOf(current) : order.length
  const next = order[clamp(at + by, 0, order.length - 1)]!
  if (next === current) return
  await select($, next)
  await reveal($, next)
}

async function scrollBy($: EngineInterface, region: 'list' | 'preview', by: number) {
  const at = drawn.layout
  if (!at) return
  if (region === 'list') {
    const max = Math.max(0, drawn.listTotal - at.listRows)
    await update($, scroll, s => {
      const from = s.list === FOLLOW ? max : s.list
      const to = clamp(from + by, 0, max)
      return { ...s, list: to === max ? FOLLOW : to }
    })
    return
  }
  const max = Math.max(0, drawn.previewTotal - at.previewRows)
  const shown = drawn.shown
  await update($, scroll, s => ({ ...s, preview: clamp((s.previewFor === shown ? s.preview : 0) + by, 0, max), previewFor: shown }))
}

async function scrollTo($: EngineInterface, region: 'list' | 'preview', offset: number) {
  const at = drawn.layout
  if (!at) return
  const current = await read($, scroll)
  const from = region === 'list' ? (current.list === FOLLOW ? Math.max(0, drawn.listTotal - at.listRows) : current.list) : current.previewFor === drawn.shown ? current.preview : 0
  await scrollBy($, region, offset - from)
}

async function act($: EngineInterface, action: Action) {
  const page = Math.max(1, (drawn.layout?.previewRows ?? 10) - 2)
  if (action === 'locale') return update($, locale, l => ((l ?? session.locale) === 'ko' ? 'en' : 'ko'))
  if (action === 'up') return scrollBy($, 'preview', -page)
  if (action === 'down') return scrollBy($, 'preview', page)
  // Reached from a surface module or a closure, never the person's own input: the engine would
  // refuse the scroll, so this only says where the jump is.
  await update($, note, () => '')
  return undefined
}

// A key a surface module passed on. In the list the arrows walk the prompts; elsewhere they
// scroll the preview. Enter jumps to the picked prompt anywhere.
async function pressKey($: EngineInterface, element: string, key: string) {
  const inList = element === 'list' || element === 'lbar'
  if (key === 'return') return undefined // a surface module's Enter cannot move the transcript
  if (inList && (key === 'up' || key === 'k')) return pick($, -1)
  if (inList && (key === 'down' || key === 'j')) return pick($, 1)
  if (inList && key === 'home') return pick($, -drawn.order.length)
  if (inList && key === 'end') return pick($, drawn.order.length)
  if (key === 'up' || key === 'k') return scrollBy($, 'preview', -1)
  if (key === 'down' || key === 'j') return scrollBy($, 'preview', 1)
  if (key === 'pageup') return scrollBy($, inList ? 'list' : 'preview', -(drawn.layout?.listRows ?? 10))
  if (key === 'pagedown') return scrollBy($, inList ? 'list' : 'preview', drawn.layout?.listRows ?? 10)
  return undefined
}

async function openPane($: EngineInterface, focus: boolean) {
  return $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, ...(focus ? { focus: true as const } : {}) })
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)

// /prompts toggles the pane; on and off say which; a number jumps to that prompt.
async function command($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  const wantsOff = arg === 'off' || arg === 'close' || (arg === '' && (await isOpen($)))
  if (wantsOff) {
    await $.ui.close({ id: PANE }).catch(() => undefined)
    return { text: 'Closed. /prompts opens it again.' }
  }
  const opened = await openPane($, arg === '' || arg === 'on' || arg === 'open')
  const list = await read($, prompts)
  if (/^\d+$/.test(arg)) {
    const target = list[Number(arg) - 1]
    if (!target) return { text: `${list.length} prompt${list.length === 1 ? '' : 's'} so far; there is no #${arg}.` }
    const moved = await jump($, target.uuid)
    await reveal($, target.uuid)
    return { text: moved.deny ? `Could not jump to #${arg}: ${moved.deny}` : `Jumped to prompt #${arg}.` }
  }
  if (!opened.isPlaced) return { text: `The pane could not be shown (${opened.reason}).` }
  return { text: `${list.length} prompt${list.length === 1 ? '' : 's'}. ↑↓ pick one, Enter jumps back to it; Esc hands the keys back to the prompt, /${session.command} closes the pane.` }
}

export const register: Register = (on, options) => {
  session.locale = options.locale === 'en' ? 'en' : 'ko'

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    for (const name of ['prompts', 'prompt-history']) {
      const ok = await $.command
        .register({ name, description: 'List the prompts you sent this session; jump back to one', argumentHint: '[on | off | number]' })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        session.command = name
        break
      }
    }
    await update($, now, () => Date.now())
    await loadTimezone($).catch(() => undefined)
    await loadTranscript($, e.cwd).catch(() => undefined)
    try {
      $.clock.every(TICK_MS, () => void update($, now, () => Date.now()))
    } catch {
      // No clock (a host without timers): the times update as prompts arrive instead.
    }
    return r
  })

  // Each prompt the person sends, as the conversation keeps it.
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || e.message.isMeta || !PEOPLE.has(e.origin.kind) || r.deny !== undefined) return r
    const text = promptText(r.message.content as { type?: string; text?: string }[])
    if (text !== null) {
      const fresh: Prompt = { uuid: r.uuid, text, at: Date.now() }
      await update($, prompts, list => merge(list, [fresh])).catch(() => undefined)
      await update($, now, () => Date.now()).catch(() => undefined)
    }
    return r
  }).catch(($, e, next) => next(e)) // never in the way of the row being kept

  // A /clear starts a new conversation under a new id: its prompts start over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, prompts, () => [])
      await update($, selected, () => null)
      await update($, scroll, () => ({ list: FOLLOW, preview: 0, previewFor: null }))
    }
    return next(e)
  })

  on('command.run', { command: 'prompts' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'prompt-history' }, async ($, e) => command($, e.args))

  // What the pane's surface modules post: the picked prompt, a control's action, a scrollbar's
  // offset, or a key.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = (e.data ?? {}) as { pick?: unknown; press?: unknown; action?: unknown; offset?: unknown }
    if (typeof data.pick === 'string') {
      await select($, data.pick)
    } else if (typeof data.press === 'string') {
      await pressKey($, e.element, data.press)
    } else if (data.action === 'locale' || data.action === 'up' || data.action === 'down' || data.action === 'jump') {
      await act($, data.action)
    } else if (typeof data.offset === 'number') {
      if (e.element === 'lbar') await scrollTo($, 'list', data.offset)
      if (e.element === 'pbar') await scrollTo($, 'preview', data.offset)
    }
    return {}
  })

  // The Jump button: a press is the person's own input, so this hook's `$` may move the transcript.
  on('ui.press', { requestId: PANE, element: 'copy' }, async ($, e, next) => {
    const uuid = drawn.shown
    if (uuid) await copy($, uuid, e.surface)
    return next(e)
  })

  on('ui.press', { requestId: PANE, element: 'jump' }, async ($, e, next) => {
    const uuid = drawn.shown
    if (uuid) await jump($, uuid)
    return next(e)
  })

  // The wheel scrolls the column under it. The pane's keys (a scroll with no pointer) walk the
  // list instead, the engine's window kept still: so with the pane focused, ↑↓ pick at once.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.origin.kind === 'person' && e.pointer === undefined) {
      const step = keyStep(e.by, e.bodyRows, e.contentRows, (drawn.layout?.listRows ?? 10) - 2)
      if (step !== 0) await pick($, step)
      return {}
    }
    const at = drawn.layout
    const overList =
      at !== null && e.pointer !== undefined && (at.isStacked ? e.pointer.row < at.listRows + 2 : e.pointer.column < at.listWidth)
    await scrollBy($, overList ? 'list' : 'preview', e.by)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const at = layout(e.props.bodyColumns, e.props.scroll.bodyRows)
    const lang = (await read($, locale)) ?? session.locale
    const list = await read($, prompts)
    const clockNow = Math.max(await read($, now), list[list.length - 1]?.at ?? 0)
    const offset = await read($, tzOffset)
    const offsets = await read($, scroll)
    const picked = await read($, selected)

    // The list: a heading per day, then each prompt cut to its row.
    const digits = String(list.length).length
    const inner = at.listWidth - 1
    const rows: ListRow[] = []
    list.forEach((p, i) => {
      if (i === 0 || !sameDay(list[i - 1]!.at, p.at, offset)) rows.push({ kind: 'day', label: dayLabel(p.at, clockNow, offset, lang) })
      const time = relative(p.at, clockNow, offset, lang)
      // Cut roughly here; the list cuts it exactly so the time always shows whole.
      const room = inner - 1 - digits - 4 - textWidth(time) - 2
      const flat = p.text.replace(/\s*\n\s*/g, ' ↵ ')
      rows.push({ kind: 'prompt', uuid: p.uuid, no: String(i + 1).padStart(digits), text: truncate(flat, Math.max(4, room)), time, isSelected: p.uuid === picked })
    })
    const maxList = Math.max(0, rows.length - at.listRows)
    const listOffset = offsets.list === FOLLOW ? maxList : clamp(offsets.list, 0, maxList)

    // The preview: the picked prompt, else the newest.
    const byId = new Map(list.map((p, i) => [p.uuid, { p, i }]))
    const target = (picked && byId.get(picked)) || (list.length > 0 ? { p: list[list.length - 1]!, i: list.length - 1 } : undefined)
    let shown: Shown | null = null
    if (target) {
      const { p, i } = target
      const day = sameDay(p.at, clockNow, offset) ? '' : `${date(p.at, clockNow, offset, lang)} `
      shown = {
        prompt: p,
        no: i + 1,
        rows: rowsOf(p, Math.max(8, at.previewWidth - 1 - 3)),
        when: `${day}${clock(p.at, offset, lang)} · ${relative(p.at, clockNow, offset, lang)}`,
      }
    }
    const maxPreview = Math.max(0, (shown?.rows.length ?? 0) - at.previewRows)
    const previewOffset = shown && offsets.previewFor === shown.prompt.uuid ? clamp(offsets.preview, 0, maxPreview) : 0

    drawn.layout = at
    drawn.listTotal = rows.length
    drawn.previewTotal = shown?.rows.length ?? 0
    drawn.order = list.map(p => p.uuid)
    drawn.shown = shown?.prompt.uuid ?? null

    return (
      <Pane
        m={{
          els,
          at,
          locale: lang,
          count: list.length,
          list: rows.slice(listOffset, listOffset + at.listRows),
          listTotal: rows.length,
          listOffset,
          shown,
          previewOffset,
          note: await read($, note),
          onAction: action => void act($, action),
        }}
      />
    )
  })
}
