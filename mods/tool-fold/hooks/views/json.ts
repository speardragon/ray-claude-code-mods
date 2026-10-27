// Values as MongoDB Compass draws them: a tree of `key: value` rows, each value in its type's color,
// Extended JSON wrappers ({"$oid"}, {"$date"}, {"$numberLong"}...) read back as the types they are.
import type { Line, Span } from './kit'
import { P, s, wrap } from './kit'

// Compass's dark palette (LeafyGreen).
export const BSON = {
  key: '#e8edeb',
  string: '#35de7b',
  number: '#2dc4ff',
  bool: '#ff7dc3',
  oid: '#ff6f44',
  faint: '#889397',
  operator: '#e8edeb',
} as const

type Typed = { kind: 'string' | 'number' | 'bool' | 'null' | 'oid' | 'date' | 'long' | 'decimal' | 'regex' | 'binary' | 'other'; text: string }

// An EJSON wrapper as the type it stands for, or null for a plain object.
function ejson(v: Record<string, unknown>): Typed | null {
  const keys = Object.keys(v)
  if (keys.length === 0 || keys.length > 2) return null
  if ('$oid' in v) return { kind: 'oid', text: `ObjectId('${String(v.$oid)}')` }
  if ('$date' in v) {
    const d = v.$date
    const iso = typeof d === 'string' ? d : typeof d === 'object' && d && '$numberLong' in d ? new Date(Number((d as { $numberLong: string }).$numberLong)).toISOString() : String(d)
    return { kind: 'date', text: iso.replace(/Z$/, '+00:00') }
  }
  if ('$numberLong' in v) return { kind: 'long', text: `Long('${String(v.$numberLong)}')` }
  if ('$numberInt' in v) return { kind: 'number', text: String(v.$numberInt) }
  if ('$numberDouble' in v) return { kind: 'number', text: String(v.$numberDouble) }
  if ('$numberDecimal' in v) return { kind: 'decimal', text: `Decimal128('${String(v.$numberDecimal)}')` }
  if ('$regularExpression' in v) {
    const r = v.$regularExpression as { pattern?: string; options?: string }
    return { kind: 'regex', text: `/${r.pattern ?? ''}/${r.options ?? ''}` }
  }
  if ('$binary' in v) return { kind: 'binary', text: 'Binary(…)' }
  if ('$uuid' in v) return { kind: 'binary', text: `UUID('${String(v.$uuid)}')` }
  return null
}

function typed(v: unknown): Typed | null {
  if (v === null || v === undefined) return { kind: 'null', text: 'null' }
  if (typeof v === 'string') return { kind: 'string', text: `"${v.length > 300 ? `${v.slice(0, 300)}…` : v}"` }
  if (typeof v === 'number' || typeof v === 'bigint') return { kind: 'number', text: String(v) }
  if (typeof v === 'boolean') return { kind: 'bool', text: String(v) }
  if (typeof v === 'object' && !Array.isArray(v)) return ejson(v as Record<string, unknown>)
  return null
}

const COLOR: Record<Typed['kind'], string> = {
  string: BSON.string,
  number: BSON.number,
  date: BSON.number,
  long: BSON.number,
  decimal: BSON.number,
  bool: BSON.bool,
  null: BSON.faint,
  oid: BSON.oid,
  regex: BSON.string,
  binary: BSON.faint,
  other: P.text,
}

// A value on one line, short: what a query bar shows for a filter or a sort.
export function inline(v: unknown, budget = 200): Span[] {
  const out: Span[] = []
  let used = 0
  const put = (text: string, color: string, bold = false) => {
    if (used > budget) return
    out.push(s(text, { color, ...(bold ? { weight: 'bold' as const } : {}) }))
    used += text.length
  }
  const walk = (x: unknown) => {
    const t = typed(x)
    if (t) return put(t.text, COLOR[t.kind])
    if (Array.isArray(x)) {
      put('[', BSON.faint)
      x.forEach((item, i) => {
        if (i > 0) put(', ', BSON.faint)
        walk(item)
      })
      return put(']', BSON.faint)
    }
    const entries = Object.entries(x as Record<string, unknown>)
    put('{ ', BSON.faint)
    entries.forEach(([k, val], i) => {
      if (i > 0) put(', ', BSON.faint)
      put(k, k.startsWith('$') ? BSON.operator : BSON.key, k.startsWith('$'))
      put(': ', BSON.faint)
      walk(val)
    })
    put(' }', BSON.faint)
  }
  walk(v)
  if (used > budget) out.push(s(' …', { color: BSON.faint }))
  return out
}

// A value as a tree of rows: objects and arrays open to `depth`, deeper ones shown as `Object (n)`.
export function tree(v: unknown, width: number, opts: { depth?: number; fields?: number } = {}): Line[] {
  const maxDepth = opts.depth ?? 3
  const maxFields = opts.fields ?? 25
  const rows: Line[] = []
  const walk = (key: string | null, x: unknown, level: number) => {
    const pad = '  '.repeat(level)
    const head: Span[] = key === null ? [] : [s(key, { color: key.startsWith('$') ? BSON.operator : BSON.key, ...(key.startsWith('$') ? { weight: 'bold' as const } : {}) }), s(': ', { color: BSON.faint })]
    const t = typed(x)
    if (t) {
      rows.push(...wrap([s(pad), ...head, s(t.text, { color: COLOR[t.kind] })], width, [s(`${pad}    `)]))
      return
    }
    const isArray = Array.isArray(x)
    const entries: [string, unknown][] = isArray ? (x as unknown[]).map((item, i) => [String(i), item]) : Object.entries(x as Record<string, unknown>)
    const label = `${isArray ? 'Array' : 'Object'} (${entries.length === 0 ? 'empty' : entries.length})`
    if (entries.length === 0 || level >= maxDepth) {
      rows.push([s(pad), ...head, s(`▸ ${label}`, { color: BSON.faint })])
      return
    }
    if (key !== null) rows.push([s(pad), ...head, s(`▾ ${label}`, { color: BSON.faint })])
    entries.slice(0, maxFields).forEach(([k, val]) => walk(k, val, key === null ? level : level + 1))
    if (entries.length > maxFields) rows.push([s(`${pad}  `), s(`⋯ ${entries.length - maxFields} more ${isArray ? 'items' : 'fields'}`, { color: BSON.faint, italic: true })])
  }
  walk(null, v, 0)
  return rows
}

// A result's text as a value: JSON, or the JSON inside MongoDB MCP's <untrusted-user-data> blocks.
export function parseText(text: string | undefined): unknown {
  if (!text) return undefined
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through
  }
  const blocks = [...trimmed.matchAll(/<untrusted-user-data-[^>]*>([\s\S]*?)<\/untrusted-user-data-[^>]*>/g)].map(m => m[1]!.trim())
  if (blocks.length > 0) {
    const docs = blocks.flatMap(b => {
      try {
        const v = JSON.parse(b)
        return Array.isArray(v) ? v : [v]
      } catch {
        return []
      }
    })
    if (docs.length > 0) return { documents: docs }
  }
  return undefined
}
