// link-list: every link in Claude's replies, in a pane beside the chat.
//   Newest reply first, a header per reply ("3분 전 · 답변 #8 · 링크 4개"), a row per link: its number
//   (the one readability writes after it in the reply), its favicon, its words and its host. A click
//   or Enter opens it, c copies it. Links come from each reply as it is kept (session.append) and,
//   when the mod loads, from the replies already in the transcript file. Favicons are fetched with
//   curl once the pane has been opened, a host at a time, and drawn where the terminal draws pictures.
//   /links opens the pane; /links <n> opens link n of the latest reply that has links.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Favicon, Group, Locale } from '../types'
import { groupOf, hostOf, mergeGroups, replyText } from './collect'
import { fetchFavicon } from './favicon'
import { keyStep } from './keys'
import { columnsOf, rowsOf } from './rows'
import type { LinkRow } from './rows'
import { parseOffset, relative } from './time'
import { PICK, parseTranscript, transcriptPath } from './transcript'
import { CHROME_ROWS, Pane, T } from './view'
import type { Action, PaneModel } from './view'
import { C } from './theme'

const PANE = 'link-list'
const TITLE = 'Links'
const DOCK_COLUMNS = 100
const TICK_MS = 30_000 // how often "3분 전" is brought up to date

// Held by the host, so a hot reload keeps them.
const groups = atom({ plugin: 'link-list', key: 'groups' } as const, [] as Group[])
const selected = atom({ plugin: 'link-list', key: 'selected' } as const, null as string | null)
const offset = atom({ plugin: 'link-list', key: 'offset' } as const, 0)
const favicons = atom({ plugin: 'link-list', key: 'favicons' } as const, {} as Record<string, Favicon>)
const isFetching = atom({ plugin: 'link-list', key: 'isFetching' } as const, false)
const locale = atom({ plugin: 'link-list', key: 'locale' } as const, null as Locale | null)
const now = atom({ plugin: 'link-list', key: 'now' } as const, 0)
const tzOffset = atom({ plugin: 'link-list', key: 'tzOffset' } as const, -new Date().getTimezoneOffset())
const note = atom({ plugin: 'link-list', key: 'note' } as const, '')

// The module's own bookkeeping; a reload starts it over.
const session = { command: 'links', locale: 'ko' as Locale }
const drawn = { order: [] as LinkRow[], listRows: 10, total: 0, rowOf: new Map<string, number>() }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// ---- favicons ---------------------------------------------------------------------------------

// A picture kept from before icons were laid on tiles (0.1.0's first builds): fetched again.
const isOlder = (icon: Favicon) => icon.state === 'ready' && typeof icon.isTile !== 'boolean'

// Fetches the favicons of the hosts not yet tried, each on its own; a draw never waits for one.
async function fetchMissing($: EngineInterface) {
  if (!(await read($, isFetching))) return
  const known = await read($, favicons)
  const hosts = [...new Set((await read($, groups)).flatMap(g => g.links.map(l => hostOf(l.url))))].filter(h => h && (!known[h] || isOlder(known[h]!)))
  if (hosts.length === 0) return
  await update($, favicons, all => ({ ...all, ...Object.fromEntries(hosts.map(h => [h, { state: 'loading' as const }])) }))
  for (const host of hosts) {
    void fetchFavicon($, host, { chip: C.chip, letter: C.badgeFg })
      .then(icon => update($, favicons, all => ({ ...all, [host]: icon })))
      .catch(() => undefined)
  }
}

// ---- collecting -------------------------------------------------------------------------------

async function addGroups($: EngineInterface, found: Group[]) {
  if (found.length === 0) return
  await update($, groups, list => mergeGroups(list, found))
  await update($, now, () => Date.now())
  await fetchMissing($)
}

async function loadTranscript($: EngineInterface, cwd: string) {
  const id = await $.session.id()
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) ?? `${home}/.claude`
  const run = await $.process.run(['/bin/sh', '-c', PICK, 'sh', transcriptPath(configDir, cwd, id)]).catch(() => null)
  if (!run || run.exitCode > 1) return
  await addGroups($, parseTranscript(run.stdout))
}

async function loadTimezone($: EngineInterface) {
  const run = await $.process.run(['date', '+%z']).catch(() => null)
  const found = run ? parseOffset(run.stdout) : null
  if (found !== null) await update($, tzOffset, () => found)
}

// ---- acting on a link -------------------------------------------------------------------------

const lang = async ($: EngineInterface) => (await read($, locale)) ?? session.locale

async function say($: EngineInterface, ko: string, en: string) {
  const text = (await lang($)) === 'ko' ? ko : en
  await update($, note, () => text)
}

// Opens a URL the way the person's desktop does: macOS `open`, else `xdg-open`.
async function openUrl($: EngineInterface, url: string) {
  for (const opener of ['open', 'xdg-open']) {
    const r = await $.process.run([opener, url]).catch(() => null)
    if (r && r.exitCode === 0) return say($, `↗ 열었어요: ${url}`, `↗ Opened ${url}`)
    if (r && r.exitCode !== 127) return say($, `열 수 없어요 (${r.stderr.trim() || `exit ${r.exitCode}`})`, `Could not open it (${r.stderr.trim() || `exit ${r.exitCode}`})`)
  }
  return say($, '링크를 열 프로그램(open, xdg-open)이 없어요.', 'Nothing to open it with (open, xdg-open).')
}

async function copyUrl($: EngineInterface, url: string, surface?: RenderSurface) {
  const done = await $.ui.copy({ text: url, ...(surface ? { surface } : {}) }).catch((error: unknown) => ({
    isCopied: false as const,
    reason: error instanceof Error ? error.message : String(error),
  }))
  return done.isCopied ? say($, `✓ 복사했어요: ${url}`, `✓ Copied ${url}`) : say($, `복사 못 함: ${done.reason}`, `Could not copy: ${done.reason}`)
}

const rowByKey = (key: string | null) => (key ? drawn.order.find(r => r.key === key) : undefined)

// Keeps the picked link inside the list's window.
async function reveal($: EngineInterface, key: string) {
  const at = drawn.rowOf.get(key)
  if (at === undefined) return
  await update($, offset, top => {
    const next = at < top ? Math.max(0, at - 1) : at >= top + drawn.listRows ? at - drawn.listRows + 1 : top
    return clamp(next, 0, Math.max(0, drawn.total - drawn.listRows))
  })
}

async function pick($: EngineInterface, by: number) {
  const order = drawn.order
  if (order.length === 0) return
  const current = await read($, selected)
  const at = order.findIndex(r => r.key === current)
  const next = order[at < 0 ? (by > 0 ? 0 : order.length - 1) : clamp(at + by, 0, order.length - 1)]!
  await update($, selected, () => next.key)
  await update($, note, () => '')
  await reveal($, next.key)
}

async function act($: EngineInterface, action: Action, surface?: RenderSurface) {
  if (action === 'clear') {
    await update($, groups, () => [])
    await update($, selected, () => null)
    await update($, offset, () => 0)
    return say($, '✓ 목록을 비웠어요.', '✓ The list is cleared.')
  }
  const row = rowByKey(await read($, selected))
  if (!row) return say($, '먼저 링크를 고르세요.', 'Pick a link first.')
  return action === 'open' ? openUrl($, row.url) : copyUrl($, row.url, surface)
}

// A key the list's or a control's surface module passed on.
async function pressKey($: EngineInterface, key: string) {
  const page = Math.max(1, drawn.listRows - 2)
  if (key === 'up' || key === 'k') return pick($, -1)
  if (key === 'down' || key === 'j') return pick($, 1)
  if (key === 'home') return pick($, -drawn.order.length)
  if (key === 'end') return pick($, drawn.order.length)
  if (key === 'pageup') return pick($, -page)
  if (key === 'pagedown') return pick($, page)
  if (key === 'return') return act($, 'open')
  if (key === 'c') return act($, 'copy')
  return undefined
}

// ---- the pane and the command -----------------------------------------------------------------

async function openPane($: EngineInterface, focus: boolean) {
  await update($, isFetching, () => true)
  const placed = await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, ...(focus ? { focus: true as const } : {}) })
  await fetchMissing($)
  return placed
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)

// The latest reply that has links, and its link `n`.
async function nth($: EngineInterface, n: number) {
  const list = await read($, groups)
  const last = list[list.length - 1]
  return { last, link: last?.links.find(l => l.no === n) }
}

async function command($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  const ko = (await lang($)) === 'ko'
  if (arg === 'clear') {
    await act($, 'clear')
    return { text: ko ? '링크 목록을 비웠어요.' : 'The link list is cleared.' }
  }
  if (/^\d+$/.test(arg)) {
    const { last, link } = await nth($, Number(arg))
    if (!last) return { text: ko ? '아직 답변에 나온 링크가 없어요.' : 'No links in the replies yet.' }
    if (!link) return { text: ko ? `최근 답변에는 링크가 ${last.links.length}개입니다.` : `The latest reply has ${last.links.length} link${last.links.length === 1 ? '' : 's'}.` }
    await openUrl($, link.url)
    return { text: (await read($, note)) || link.url }
  }
  const wantsOff = arg === 'off' || arg === 'close' || (arg === '' && (await isOpen($)))
  if (wantsOff) {
    await $.ui.close({ id: PANE }).catch(() => undefined)
    return { text: ko ? `닫았어요. /${session.command}로 다시 열어요.` : `Closed. /${session.command} opens it again.` }
  }
  const placed = await openPane($, true)
  if (!placed.isPlaced) return { text: ko ? `패널을 띄우지 못했어요 (${placed.reason}).` : `The pane could not be shown (${placed.reason}).` }
  const count = (await read($, groups)).reduce((n, g) => n + g.links.length, 0)
  return { text: ko ? `링크 ${count}개. ↑↓ 고르고 Enter로 열어요. /${session.command} <번호>는 최근 답변의 그 번호 링크를 열어요.` : `${count} links. ↑↓ pick, Enter opens. /${session.command} <n> opens link n of the latest reply.` }
}

export const register: Register = (on, options) => {
  session.locale = options.locale === 'en' ? 'en' : 'ko'

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    for (const name of ['links', 'link-list']) {
      const ok = await $.command
        .register({ name, description: "List the links in Claude's replies; open one", argumentHint: '[on | off | clear | number]', immediate: true })
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
      // No clock: the times update as links arrive instead.
    }
    return r
  })

  // Each reply as the conversation keeps it: its links become a group.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || r.deny !== undefined) return r
    const group = groupOf(r.uuid, replyText(r.message.content as { type?: string; text?: string }[]), Date.now())
    if (group) await addGroups($, [group]).catch(() => undefined)
    return r
  }).catch(($, e, next) => next(e)) // never in the way of the row being kept

  // A /clear starts a new conversation: its links start over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, groups, () => [])
      await update($, selected, () => null)
      await update($, offset, () => 0)
    }
    return next(e)
  })

  on('command.run', { command: 'links' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'link-list' }, async ($, e) => command($, e.args))

  // What the pane's surface modules post: a link clicked, a control's action, the scrollbar's
  // offset, or a key.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = (e.data ?? {}) as { open?: unknown; press?: unknown; action?: unknown; offset?: unknown }
    if (typeof data.open === 'string') {
      const row = rowByKey(data.open)
      await update($, selected, () => data.open as string)
      if (row) await openUrl($, row.url)
    } else if (typeof data.press === 'string') {
      await pressKey($, data.press)
    } else if (data.action === 'open' || data.action === 'copy' || data.action === 'clear') {
      await act($, data.action, e.surface)
    } else if (typeof data.offset === 'number') {
      const to = data.offset
      await update($, offset, () => clamp(to, 0, Math.max(0, drawn.total - drawn.listRows)))
    }
    return {}
  })

  // The controls drawn as Buttons, where a surface has no Client.
  on('ui.press', { requestId: PANE }, async ($, e, next) => {
    if (e.element === 'open' || e.element === 'copy' || e.element === 'clear') await act($, e.element, e.surface)
    return next(e)
  })

  // The wheel scrolls the list; the pane's keys (a scroll with no pointer) walk the links instead.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.origin.kind === 'person' && e.pointer === undefined) {
      const step = keyStep(e.by, e.bodyRows, e.contentRows, drawn.listRows - 2)
      if (step !== 0) await pick($, step)
      return {}
    }
    await update($, offset, top => clamp(top + e.by, 0, Math.max(0, drawn.total - drawn.listRows)))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const height = e.props.scroll.bodyRows
    const listRows = Math.max(3, height - CHROME_ROWS)
    const loc = await lang($)
    const list = await read($, groups)
    const clockNow = Math.max(await read($, now), list[list.length - 1]?.at ?? 0)
    const tz = await read($, tzOffset)
    const picked = await read($, selected)
    const rows = rowsOf(list, picked, loc, at => relative(at, clockNow, tz, loc))
    const top = clamp(await read($, offset), 0, Math.max(0, rows.length - listRows))

    drawn.order = rows.filter((r): r is LinkRow => r.kind === 'link')
    drawn.listRows = listRows
    drawn.total = rows.length
    drawn.rowOf = new Map(rows.flatMap((r, i) => (r.kind === 'link' ? [[r.key, i] as const] : [])))

    const pickedRow = rowByKey(picked)
    const message = await read($, note)
    const status = message
      ? { text: message, color: message.startsWith('✓') || message.startsWith('↗') ? C.ok : C.warn }
      : pickedRow
        ? { text: pickedRow.url, color: C.muted }
        : { text: T[loc].hint, color: C.muted }

    const m: PaneModel = {
      els: { ...els, Image: e.surface === 'terminal' ? (els as { Image?: PaneModel['els']['Image'] }).Image : undefined },
      width,
      height,
      listRows,
      locale: loc,
      count: drawn.order.length,
      columns: columnsOf(list, width),
      rows: rows.slice(top, top + listRows),
      total: rows.length,
      offset: top,
      favicons: await read($, favicons),
      status,
      onAction: action => void act($, action),
    }
    return <Pane m={m} />
  })
}
