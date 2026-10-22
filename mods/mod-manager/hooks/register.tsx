// mod-manager: the installed Claude Code mods (and, under All, every plugin) in one pane.
//   Left, the list grouped by marketplace, each with a switch; right, the picked one: its scope,
//   its slash commands as buttons (a mod's panel opens from its command) and its README.
//   A switch runs `claude plugin enable|disable` at the scope that applies here; the change takes
//   hold at the next /reload-plugins, which the footer offers. The manager's own row and this
//   session's dev mods have no switch: turning those off would take the pane or the session's work
//   away with no way back from here.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Filter, ModCommand, ModEntry, Scroll } from '../types'
import { applicable, entry, parseList, sortEntries } from './catalog'
import type { ListRow } from './list-client'
import { SWITCH } from './list-client'
import { mdRows } from './markdown'
import type { MdRow } from './markdown'
import { textWidth, truncate } from './text'
import { detailHead, layout, Pane } from './view'
import type { Layout } from './view'

const PANE = 'mod-manager'
const TITLE = 'Mods'
const DOCK_COLUMNS = 110
const CLI_TIMEOUT_MS = 60_000

// Held by the host, so a hot reload keeps them.
const entries = atom({ plugin: 'mod-manager', key: 'entries' } as const, [] as ModEntry[])
const loadedAt = atom({ plugin: 'mod-manager', key: 'loadedAt' } as const, 0)
const selected = atom({ plugin: 'mod-manager', key: 'selected' } as const, null as string | null)
const filter = atom({ plugin: 'mod-manager', key: 'filter' } as const, 'mods' as Filter)
const scroll = atom({ plugin: 'mod-manager', key: 'scroll' } as const, { list: 0, detail: 0, detailFor: null } as Scroll)
const busy = atom({ plugin: 'mod-manager', key: 'busy' } as const, '')
const note = atom({ plugin: 'mod-manager', key: 'note' } as const, '')
const needsReload = atom({ plugin: 'mod-manager', key: 'needsReload' } as const, false)

// The module's own bookkeeping; a reload starts it over.
const session = { cwd: '', command: 'mods', self: '', loading: null as Promise<void> | null }
const drawn = { layout: null as Layout | null, listTotal: 0, readmeTotal: 0, readmeRows: 0, order: [] as string[], shown: null as string | null }
const readmes = new Map<string, string | null>() // README text by plugin root
const mdCache = new Map<string, { width: number; rows: MdRow[] }>()

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function readFile($: EngineInterface, path: string): Promise<string | null> {
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? text : null
}

// Each plugin's slash commands, as the session lists them now.
async function commandsByPlugin($: EngineInterface): Promise<Map<string, ModCommand[]>> {
  const all = await $.command.list().catch(() => [])
  const by = new Map<string, ModCommand[]>()
  for (const c of all) {
    if (c.source !== 'plugin' || !c.plugin) continue
    const name = c.plugin.split('@')[0]!
    by.set(name, [...(by.get(name) ?? []), { name: c.name, description: c.description }])
  }
  return by
}

// The mods this session hot-reloads from its own folder: not installed, so not in the CLI's list.
async function sessionMods($: EngineInterface, commands: Map<string, ModCommand[]>, installed: Set<string>): Promise<ModEntry[]> {
  const parent = $.plugin.root.slice(0, $.plugin.root.lastIndexOf('/'))
  if (!/\/dev-mods\/[^/]+$/.test(parent)) return []
  const listed = await $.fs.list(parent).catch(() => [])
  const found = await Promise.all(
    listed.map(async item => {
      const root = `${parent}/${item.name}`
      const pluginJson = await readFile($, `${root}/.claude-plugin/plugin.json`)
      if (pluginJson === null || installed.has(item.name)) return null
      const hooksJson = await readFile($, `${root}/hooks/hooks.json`)
      return entry({ id: item.name, scope: 'session', enabled: true, root }, { hooksJson, pluginJson }, commands.get(item.name) ?? [])
    }),
  )
  return found.filter((e): e is ModEntry => e !== null)
}

async function loadCatalog($: EngineInterface) {
  session.loading ??= (async () => {
    await update($, busy, () => 'reading plugins')
    try {
      const run = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: CLI_TIMEOUT_MS })
      if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `claude plugin list exited ${run.exitCode}`)
      const rows = applicable(parseList(run.stdout), session.cwd)
      const commands = await commandsByPlugin($)
      const installed = await Promise.all(
        rows.map(async row => {
          const [hooksJson, pluginJson] = await Promise.all([
            readFile($, `${row.installPath}/hooks/hooks.json`),
            readFile($, `${row.installPath}/.claude-plugin/plugin.json`),
          ])
          const scope = row.scope === 'local' || row.scope === 'project' ? row.scope : 'user'
          return entry({ id: row.id, scope, enabled: row.enabled, root: row.installPath, version: row.version }, { hooksJson, pluginJson }, row.enabled ? (commands.get(row.id.split('@')[0]!) ?? []) : [])
        }),
      )
      const names = new Set(installed.map(e => e.name))
      const local = await sessionMods($, commands, names)
      await update($, entries, () => sortEntries([...installed, ...local]))
      await update($, loadedAt, () => Date.now())
      await update($, note, n => (n.startsWith('Could not read') ? '' : n))
    } catch (error) {
      await update($, note, () => `Could not read the plugins: ${errorText(error)}`)
    } finally {
      await update($, busy, () => '')
      session.loading = null
    }
  })()
  return session.loading
}

async function toggle($: EngineInterface, id: string) {
  const list = await read($, entries)
  const target = list.find(e => e.id === id)
  if (!target || target.scope === 'session' || target.name === session.self || (await read($, busy))) return
  const verb = target.enabled ? 'disable' : 'enable'
  await update($, busy, () => `${verb === 'enable' ? 'enabling' : 'disabling'} ${target.name}`)
  try {
    const run = await $.process.run(['claude', 'plugin', verb, target.id, '--scope', target.scope], { timeoutMs: CLI_TIMEOUT_MS })
    if (run.exitCode !== 0) throw new Error((run.stderr || run.stdout).trim().split('\n')[0] || `exit ${run.exitCode}`)
    await update($, entries, l => l.map(e => (e.id === id ? { ...e, enabled: !e.enabled } : e)))
    await update($, needsReload, () => true)
    await update($, note, () => `${target.name} ${verb}d (${target.scope}). Reload to apply.`)
  } catch (error) {
    await update($, note, () => `Could not ${verb} ${target.name}: ${errorText(error)}`)
  } finally {
    await update($, busy, () => '')
  }
}

async function reloadPlugins($: EngineInterface) {
  try {
    await $.command.run({ command: 'reload-plugins' })
    await update($, needsReload, () => false)
    await update($, note, () => '')
    await loadCatalog($)
  } catch (error) {
    await update($, note, () => `Type /reload-plugins to apply (${errorText(error)})`)
  }
}

// Runs a plugin's command, as if typed: a mod's panel opens this way.
async function runCommand($: EngineInterface, name: string) {
  try {
    const result = await $.command.run({ command: name })
    await update($, note, () => (result.text ? `/${name}: ${result.text.split('\n')[0]}` : ''))
  } catch (error) {
    await update($, note, () => `/${name}: ${errorText(error)}`)
  }
}

async function pick($: EngineInterface, id: string) {
  await update($, selected, () => id)
  await update($, scroll, s => ({ ...s, detail: 0, detailFor: id }))
}

async function step($: EngineInterface, by: number) {
  const order = drawn.order
  if (order.length === 0) return
  const at = drawn.shown ? order.indexOf(drawn.shown) : -1
  await pick($, order[clamp(at + by, 0, order.length - 1)]!)
}

async function scrollBy($: EngineInterface, region: 'list' | 'detail', by: number) {
  const at = drawn.layout
  if (!at) return
  if (region === 'list') {
    const max = Math.max(0, drawn.listTotal - at.listRows)
    await update($, scroll, s => ({ ...s, list: clamp(s.list + by, 0, max) }))
    return
  }
  const max = Math.max(0, drawn.readmeTotal - drawn.readmeRows)
  const shown = drawn.shown
  await update($, scroll, s => ({ ...s, detail: clamp((s.detailFor === shown ? s.detail : 0) + by, 0, max), detailFor: shown }))
}

async function act($: EngineInterface, action: string) {
  const page = Math.max(1, drawn.readmeRows - 2)
  if (action === 'filter') return update($, filter, f => (f === 'mods' ? 'all' : 'mods'))
  if (action === 'refresh') return loadCatalog($)
  if (action === 'toggle') return drawn.shown ? toggle($, drawn.shown) : undefined
  // A command runs once the session is idle: not awaited, so a running turn does not hold this hook.
  if (action === 'reload') return void reloadPlugins($)
  if (action === 'up') return scrollBy($, 'detail', -page)
  if (action === 'down') return scrollBy($, 'detail', page)
  if (action.startsWith('run:')) return void runCommand($, action.slice(4))
  return undefined
}

// A key a surface module passed on: in the list the arrows walk it, space switches the picked
// plugin and Enter runs its first command; elsewhere the arrows scroll the README.
async function pressKey($: EngineInterface, element: string, key: string) {
  const inList = element === 'list' || element === 'lbar'
  if (inList && (key === 'up' || key === 'k')) return step($, -1)
  if (inList && (key === 'down' || key === 'j')) return step($, 1)
  if (key === ' ' || key === 'space') return act($, 'toggle')
  if (key === 'return') {
    const shown = (await read($, entries)).find(e => e.id === drawn.shown)
    return shown?.commands[0] ? void runCommand($, shown.commands[0].name) : undefined
  }
  if (key === 'up' || key === 'k') return scrollBy($, 'detail', -1)
  if (key === 'down' || key === 'j') return scrollBy($, 'detail', 1)
  if (key === 'pageup') return act($, 'up')
  if (key === 'pagedown') return act($, 'down')
  if (key === 'r') return loadCatalog($)
  return undefined
}

function readmeOf(root: string, width: number): MdRow[] {
  const text = readmes.get(root)
  if (!text) return []
  const kept = mdCache.get(root)
  if (kept && kept.width === width) return kept.rows
  const rows = mdRows(text, width)
  mdCache.set(root, { width, rows })
  return rows
}

async function command($: EngineInterface, args: string) {
  const arg = args.trim()
  if (arg === 'refresh') {
    await loadCatalog($)
    return { text: `${(await read($, entries)).length} plugins read.` }
  }
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, focus: true })
  void loadCatalog($)
  if (!opened.isPlaced) return { text: `The pane could not be shown (${opened.reason}).` }
  return { text: 'Click a mod to read about it, its switch to turn it on or off, a command to open its panel.' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    session.cwd = e.cwd
    session.self = $.plugin.name
    for (const name of ['mods', 'mod-manager']) {
      const ok = await $.command
        .register({ name, description: 'Browse your installed mods, switch them on or off, open their panels', argumentHint: '[refresh]' })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        session.command = name
        break
      }
    }
    return r
  })

  on('command.run', { command: 'mods' }, async ($, e) => command($, e.args))
  on('command.run', { command: 'mod-manager' }, async ($, e) => command($, e.args))

  // What the pane's surface modules post: a picked row, a switch, a control's action, a
  // scrollbar's offset, or a key. Every `$` call here is this hook's own.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = (e.data ?? {}) as { pick?: unknown; toggle?: unknown; action?: unknown; press?: unknown; offset?: unknown }
    if (typeof data.pick === 'string') await pick($, data.pick)
    else if (typeof data.toggle === 'string') {
      await pick($, data.toggle)
      await toggle($, data.toggle)
    } else if (typeof data.action === 'string') await act($, data.action)
    else if (typeof data.press === 'string') await pressKey($, e.element, data.press)
    else if (typeof data.offset === 'number') {
      const offset = data.offset
      if (e.element === 'lbar') await update($, scroll, s => ({ ...s, list: clamp(offset, 0, Math.max(0, drawn.listTotal - (drawn.layout?.listRows ?? 0))) }))
      if (e.element === 'dbar') await update($, scroll, s => ({ ...s, detail: clamp(offset, 0, Math.max(0, drawn.readmeTotal - drawn.readmeRows)), detailFor: drawn.shown }))
    }
    return {}
  })

  // The wheel scrolls the column under it; the keys (no pointer) scroll the README.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const at = drawn.layout
    const overList = at !== null && e.pointer !== undefined && (at.isStacked ? e.pointer.row < at.listRows + 2 : e.pointer.column < at.listWidth)
    await scrollBy($, overList ? 'list' : 'detail', e.by)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const at = layout(e.props.bodyColumns, e.props.scroll.bodyRows)
    const all = await read($, entries)
    const mode = await read($, filter)
    const shown = mode === 'mods' ? all.filter(x => x.isMod) : all
    const offsets = await read($, scroll)
    const picked = await read($, selected)
    const target = shown.find(x => x.id === picked) ?? shown[0] ?? null

    // The list: a heading per marketplace, a row per plugin cut to fit before its switch.
    const inner = at.listWidth - 1
    const rows: ListRow[] = []
    let group = ''
    for (const x of shown) {
      const label = x.scope === 'session' ? 'this session' : x.marketplace || 'local'
      if (label !== group) {
        rows.push({ kind: 'group', label })
        group = label
      }
      const tag = mode === 'all' && !x.isMod ? 'plugin' : ''
      const version = x.version ? truncate(x.version, 10) : ''
      const room = inner - (1 + 3 + 1 + textWidth(version) + (tag ? tag.length + 1 : 0) + SWITCH) - 1
      rows.push({
        kind: 'mod',
        id: x.id,
        name: truncate(x.name, Math.max(4, room)),
        version,
        isOn: x.enabled,
        lock: x.scope === 'session' ? 'dev' : x.name === session.self ? 'self' : '',
        tag,
        isSelected: x.id === target?.id,
      })
    }
    const listOffset = clamp(offsets.list, 0, Math.max(0, rows.length - at.listRows))

    // The detail: the README read once per plugin, wrapped to the column.
    let detail = null
    if (target) {
      if (!readmes.has(target.root)) readmes.set(target.root, await readFile($, `${target.root}/README.md`))
      const shell = { entry: target, isSelf: target.name === session.self, readme: [] as MdRow[] }
      const head = detailHead(shell, at.detailWidth)
      drawn.readmeRows = Math.max(0, at.detailHeight - head.rows - 1)
      detail = { ...shell, readme: readmeOf(target.root, Math.max(8, at.detailWidth - 1 - 3)) }
    }
    const readmeTotal = detail?.readme.length ?? 0
    const detailOffset = target && offsets.detailFor === target.id ? clamp(offsets.detail, 0, Math.max(0, readmeTotal - drawn.readmeRows)) : 0

    drawn.layout = at
    drawn.listTotal = rows.length
    drawn.readmeTotal = readmeTotal
    drawn.order = shown.map(x => x.id)
    drawn.shown = target?.id ?? null

    return (
      <Pane
        m={{
          els,
          at,
          filter: mode,
          counts: { shown: shown.length, on: shown.filter(x => x.enabled).length },
          list: rows.slice(listOffset, listOffset + at.listRows),
          listTotal: rows.length,
          listOffset,
          detail,
          detailOffset,
          busy: await read($, busy),
          note: await read($, note),
          needsReload: await read($, needsReload),
          isLoaded: (await read($, loadedAt)) > 0,
        }}
      />
    )
  })
}
