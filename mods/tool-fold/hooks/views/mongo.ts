// A MongoDB MCP call drawn the way MongoDB Compass draws a query: the namespace, a query bar of
// what was asked (filter, projection, sort, skip, limit, a pipeline as stages), and the result:
// documents as cards with each value in its type's color, counts as stat cards, lists as rows.
import { BSON, inline, parseText, tree } from './json'
import type { Line } from './kit'
import { P, badge, fill, frame, s, section, spread, wrap } from './kit'

const MCP = /^mcp__(.+?)__(.+)$/

export type MongoKind = 'read' | 'write' | 'admin' | 'meta'

const KIND: Record<string, MongoKind> = {
  find: 'read', aggregate: 'read', 'aggregate-db': 'read', count: 'read', export: 'read',
  'insert-many': 'write', 'insert-one': 'write', 'update-many': 'write', 'update-one': 'write', 'delete-many': 'write', 'delete-one': 'write',
  'create-index': 'admin', 'drop-index': 'admin', 'create-collection': 'admin', 'drop-collection': 'admin', 'drop-database': 'admin', 'rename-collection': 'admin',
  'list-databases': 'meta', 'list-collections': 'meta', 'collection-schema': 'meta', 'collection-indexes': 'meta', 'collection-storage-size': 'meta', 'db-stats': 'meta', explain: 'meta',
}

// Compass's kind badges, dark.
const KIND_COLOR: Record<MongoKind, [string, string]> = {
  read: ['#c3e7fe', '#0c2657'],
  write: ['#ffec9e', '#4c2100'],
  admin: ['#ffcdc7', '#5b0000'],
  meta: ['#c1c7c6', '#3d4f58'],
}
const GREEN = '#00ed64'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export function mongoOp(tool: string, input: unknown): { server: string; op: string } | null {
  const m = tool.match(MCP)
  if (!m) return null
  const server = m[1]!.replace(/^(claude_ai_|plugin_[^_]+_)/, '')
  const op = m[2]!.replace(/_/g, '-')
  const i = obj(input)
  const isMongo = /mongo/i.test(server) || typeof i.connectionId === 'string' || (typeof i.database === 'string' && op in KIND)
  return isMongo ? { server, op } : null
}

function stat(label: string, value: unknown, color: string): Line {
  return [s(`${label} `, { color: P.muted }), s(String(value ?? 0), { color, weight: 'bold' })]
}

function queryBar(input: Record<string, unknown>, width: number): Line[] {
  const rows: Line[] = []
  const row = (label: string, value: unknown) => {
    rows.push(...wrap([s(label.padEnd(9), { color: P.muted, weight: 'bold' }), ...inline(value, width * 3)], width - 4, [s(' '.repeat(9))]))
  }
  const filter = input.filter ?? input.query
  if (!('pipeline' in input)) {
    rows.push(...wrap([s('Filter'.padEnd(9), { color: P.muted, weight: 'bold' }), ...(filter && Object.keys(obj(filter)).length > 0 ? inline(filter, width * 3) : [s('all documents', { color: BSON.faint, italic: true })])], width - 4, [s(' '.repeat(9))]))
  }
  for (const [key, label] of [['update', 'Update'], ['projection', 'Project'], ['sort', 'Sort'], ['skip', 'Skip'], ['limit', 'Limit'], ['upsert', 'Upsert']] as const) {
    if (input[key] !== undefined) row(label, input[key])
  }
  return rows
}

function pipeline(stages: unknown[], width: number): Line[] {
  const rows: Line[] = [section('PIPELINE', `${stages.length} stage${stages.length === 1 ? '' : 's'}`)]
  stages.forEach((stage, i) => {
    const [op, body] = Object.entries(obj(stage))[0] ?? ['?', undefined]
    const writes = op === '$out' || op === '$merge'
    const head: Line = [s(`${i + 1}`.padStart(2), { color: P.subtle }), s('  '), s(op, { color: BSON.operator, weight: 'bold' }), ...(writes ? [s(' '), badge('writes', ...KIND_COLOR.write)] : [])]
    rows.push(head)
    rows.push(...wrap([s('    '), ...inline(body, width * 2)], width, [s('    ')]))
  })
  return rows
}

// One card per document, its fields a tree: what Compass's list view shows.
function documents(docs: unknown[], total: number | undefined, width: number, tone?: 'added' | 'removed'): Line[] {
  const shown = docs.slice(0, 50)
  const of = total !== undefined && total > docs.length ? `${total}` : `${docs.length}`
  const rows: Line[] = [section('DOCUMENTS', docs.length === 0 ? 'no documents' : `1 – ${shown.length} of ${of}`)]
  const bg = tone === 'added' ? '#0b2a1e' : tone === 'removed' ? '#2d1215' : P.panel
  const edge = tone === 'added' ? GREEN : tone === 'removed' ? P.err : P.border
  for (const doc of shown) rows.push(...frame(tree(doc, width - 6), width, [], bg, edge))
  if (docs.length > shown.length) rows.push([s(`⋯ ${docs.length - shown.length} more documents`, { color: BSON.faint, italic: true })])
  return rows
}

export function mongoView(tool: string, input: unknown, text: string | undefined, isError: boolean, width: number): Line[] | null {
  const which = mongoOp(tool, input)
  if (!which) return null
  const i = obj(input)
  const kind = KIND[which.op] ?? 'meta'
  const result = obj(parseText(text))
  const rows: Line[] = []

  // The namespace, as Compass's breadcrumb: server › db › collection.
  const crumbs = [which.server, i.database, i.collection].filter((x): x is string => typeof x === 'string' && x !== '')
  rows.push(spread(crumbs.flatMap((c, n) => [...(n > 0 ? [s(' › ', { color: P.subtle })] : []), s(c, { color: n === crumbs.length - 1 ? P.fg : P.muted, weight: n === crumbs.length - 1 ? 'bold' : undefined })]), [badge(kind, ...KIND_COLOR[kind]), s(' '), s(which.op, { color: GREEN, weight: 'bold' })], width))
  rows.push([])

  if (isError) {
    rows.push(...frame(wrap([s(text?.trim() || 'The call failed.', { color: P.err })], width - 4), width, [s('Error', { color: P.err, weight: 'bold' })], '#2d1215', P.err))
    rows.push([])
  }

  if (['find', 'count', 'export', 'update-many', 'update-one', 'delete-many', 'delete-one'].includes(which.op)) {
    rows.push(...frame(queryBar(i, width), width, [s('Query', { color: GREEN, weight: 'bold' })], P.bar))
    rows.push([])
  }
  if (Array.isArray(i.pipeline)) {
    rows.push(...pipeline(i.pipeline, width))
    rows.push([])
  }
  if (isError) return rows

  const docs = Array.isArray(result.documents) ? result.documents : Array.isArray(parseText(text)) ? (parseText(text) as unknown[]) : null
  switch (which.op) {
    case 'count':
      rows.push(...frame([[s(String(result.count ?? text?.match(/\d+/)?.[0] ?? '?'), { color: BSON.number, weight: 'bold' }), s('  documents', { color: P.muted })]], width, [s('Count', { color: P.muted })]))
      return rows
    case 'update-many':
    case 'update-one':
      rows.push(fill([...stat('Matched', result.matchedCount, P.fg), s('   '), ...stat('Modified', result.modifiedCount, '#ffec9e'), s('   '), ...stat('Upserted', result.upsertedCount, GREEN)], width))
      return rows
    case 'delete-many':
    case 'delete-one':
      rows.push(fill(stat('Deleted', result.deletedCount, P.err), width))
      return rows
    case 'insert-many':
    case 'insert-one': {
      rows.push(fill(stat('Inserted', result.insertedCount ?? (Array.isArray(i.documents) ? i.documents.length : 1), GREEN), width))
      rows.push([])
      const ids = Array.isArray(result.insertedIds) ? result.insertedIds : Object.values(obj(result.insertedIds))
      const added = (Array.isArray(i.documents) ? i.documents : [i.document]).map((d, n) => (ids[n] !== undefined ? { _id: ids[n], ...obj(d) } : d))
      rows.push(...documents(added, undefined, width, 'added'))
      return rows
    }
    case 'list-databases': {
      const dbs = Array.isArray(result.databases) ? (result.databases as Record<string, unknown>[]) : []
      rows.push(section('DATABASES', `${dbs.length}`))
      for (const d of dbs) rows.push(spread([s('▣ ', { color: GREEN }), s(String(d.name), { color: P.fg, weight: 'bold' })], [s(typeof d.sizeOnDisk === 'number' ? `${(d.sizeOnDisk / 1024 / 1024).toFixed(1)} MB` : '', { color: P.muted })], width))
      return rows
    }
    case 'list-collections': {
      const cols = Array.isArray(result.collections) ? (result.collections as Record<string, unknown>[]) : []
      rows.push(section('COLLECTIONS', `${cols.length}`))
      for (const c of cols) rows.push(spread([s('▤ ', { color: GREEN }), s(String(c.name), { color: P.fg, weight: 'bold' })], [s(c.type && c.type !== 'collection' ? String(c.type) : '', { color: P.muted })], width))
      return rows
    }
    case 'collection-indexes': {
      const idx = (Array.isArray(result.classicIndexes) ? result.classicIndexes : Array.isArray(result.indexes) ? result.indexes : []) as Record<string, unknown>[]
      rows.push(section('INDEXES', `${idx.length}`))
      for (const x of idx) rows.push(...wrap([s(String(x.name), { color: P.fg, weight: 'bold' }), s('  '), ...inline(x.key)], width, [s('  ')]))
      return rows
    }
  }
  if (docs) {
    rows.push(...documents(docs, typeof result.queryResultsCount === 'number' ? result.queryResultsCount : typeof result.count === 'number' ? result.count : undefined, width))
    return rows
  }
  const parsed = parseText(text)
  rows.push(section('RESULT'))
  rows.push(...(parsed !== undefined ? tree(parsed, width) : wrap([s(text ?? '', { color: P.text })], width)))
  return rows
}
