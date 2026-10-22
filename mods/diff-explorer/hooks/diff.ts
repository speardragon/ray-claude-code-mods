// Line diff (Myers), unified hunks with context, and the changed part of each paired line.

export type Op = { kind: 'eq' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number }

export type Row =
  | { kind: 'hunk'; oldStart: number; oldLines: number; newStart: number; newLines: number; skipped: number }
  | { kind: 'eq' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number; mark?: [number, number] }

export type Diff = { rows: Row[]; adds: number; dels: number; isBinary: boolean }

const CONTEXT = 3
const MAX_EDIT = 1000 // past this many differing lines, the middle is shown as all removed then all added

export const splitLines = (text: string) => {
  if (text === '') return []
  const lines = text.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Myers' O(ND) shortest edit script over the lines between a common head and tail.
export function diffLines(a: string[], b: string[]): Op[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const midA = a.slice(head, a.length - tail)
  const midB = b.slice(head, b.length - tail)
  const mid = middle(midA, midB)

  const ops: Op[] = []
  for (let i = 0; i < head; i++) ops.push({ kind: 'eq', text: a[i]!, oldNo: i + 1, newNo: i + 1 })
  let oldNo = head
  let newNo = head
  for (const op of mid) {
    if (op.kind === 'eq') ops.push({ kind: 'eq', text: op.text, oldNo: ++oldNo, newNo: ++newNo })
    else if (op.kind === 'del') ops.push({ kind: 'del', text: op.text, oldNo: ++oldNo })
    else ops.push({ kind: 'add', text: op.text, newNo: ++newNo })
  }
  for (let i = a.length - tail; i < a.length; i++) ops.push({ kind: 'eq', text: a[i]!, oldNo: ++oldNo, newNo: ++newNo })
  return ops
}

function middle(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  if (n === 0) return b.map(text => ({ kind: 'add' as const, text }))
  if (m === 0) return a.map(text => ({ kind: 'del' as const, text }))

  const max = Math.min(n + m, MAX_EDIT)
  const offset = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
      let x = down ? v[offset + k + 1]! : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
  }
  if (found < 0) {
    return [...a.map(text => ({ kind: 'del' as const, text })), ...b.map(text => ({ kind: 'add' as const, text }))]
  }

  // Walk the trace back from (n, m), collecting the script in reverse.
  const out: Op[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const prev = trace[d]!
    const k = x - y
    const down = k === -d || (k !== d && prev[offset + k - 1]! < prev[offset + k + 1]!)
    const prevK = down ? k + 1 : k - 1
    const prevX = prev[offset + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) out.push({ kind: 'eq', text: a[--x]! }), y--
    if (down) out.push({ kind: 'add', text: b[--y]! })
    else out.push({ kind: 'del', text: a[--x]! })
  }
  while (x > 0 && y > 0) out.push({ kind: 'eq', text: a[--x]! }), y--
  return out.reverse()
}

// The changed middle of a removed and an added line: what the two do not share at either end.
export function changedRange(a: string, b: string): { a: [number, number]; b: [number, number] } | null {
  if (a === b) return null
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const shared = head + tail
  // Lines that share almost nothing are told apart better without a mark.
  if (shared < Math.min(a.length, b.length) * 0.3) return null
  return { a: [head, a.length - tail], b: [head, b.length - tail] }
}

// Pairs each run of removed lines with the added run after it, line by line, and marks what changed.
function markPairs(ops: Op[]): (Op & { mark?: [number, number] })[] {
  const out: (Op & { mark?: [number, number] })[] = ops.map(op => ({ ...op }))
  let i = 0
  while (i < out.length) {
    if (out[i]!.kind !== 'del') {
      i++
      continue
    }
    const delStart = i
    while (i < out.length && out[i]!.kind === 'del') i++
    const addStart = i
    while (i < out.length && out[i]!.kind === 'add') i++
    const pairs = Math.min(addStart - delStart, i - addStart)
    for (let p = 0; p < pairs; p++) {
      const del = out[delStart + p]!
      const add = out[addStart + p]!
      const range = changedRange(del.text, add.text)
      if (range) {
        out[delStart + p] = { ...del, mark: range.a }
        out[addStart + p] = { ...add, mark: range.b }
      }
    }
  }
  return out
}

const looksBinary = (text: string) => text.slice(0, 8000).includes('\u0000')

// Unified hunks of `before` → `after`, each with up to CONTEXT unchanged lines around it.
export function unified(before: string, after: string): Diff {
  if (looksBinary(before) || looksBinary(after)) return { rows: [], adds: 0, dels: 0, isBinary: true }
  const ops = markPairs(diffLines(splitLines(before), splitLines(after)))
  const adds = ops.filter(op => op.kind === 'add').length
  const dels = ops.filter(op => op.kind === 'del').length

  const rows: Row[] = []
  const changed = ops.map((op, i) => (op.kind === 'eq' ? -1 : i)).filter(i => i >= 0)
  if (changed.length === 0) return { rows, adds, dels, isBinary: false }

  // Merge each change's window [i - CONTEXT, i + CONTEXT] into runs.
  const spans: [number, number][] = []
  for (const i of changed) {
    const lo = Math.max(0, i - CONTEXT)
    const hi = Math.min(ops.length - 1, i + CONTEXT)
    const last = spans[spans.length - 1]
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi)
    else spans.push([lo, hi])
  }

  let shownTo = 0
  for (const [lo, hi] of spans) {
    const slice = ops.slice(lo, hi + 1)
    const firstOld = slice.find(op => op.oldNo !== undefined)?.oldNo
    const firstNew = slice.find(op => op.newNo !== undefined)?.newNo
    const oldLines = slice.filter(op => op.kind !== 'add').length
    const newLines = slice.filter(op => op.kind !== 'del').length
    rows.push({
      kind: 'hunk',
      oldStart: firstOld ?? lineBefore(ops, lo, 'oldNo'),
      oldLines,
      newStart: firstNew ?? lineBefore(ops, lo, 'newNo'),
      newLines,
      skipped: lo - shownTo,
    })
    for (const op of slice) rows.push(op)
    shownTo = hi + 1
  }
  return { rows, adds, dels, isBinary: false }
}

// For a hunk with no line on one side (a pure insertion), the line it follows there.
function lineBefore(ops: Op[], at: number, side: 'oldNo' | 'newNo') {
  for (let i = at - 1; i >= 0; i--) {
    const no = ops[i]![side]
    if (no !== undefined) return no
  }
  return 0
}
