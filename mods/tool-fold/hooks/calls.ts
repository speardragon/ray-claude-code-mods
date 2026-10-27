// The tool calls the panel lists. The list itself (id, tool, state, times) is small and lives in
// $.state so the panel redraws when it changes; each call's input and result, which can be large,
// stay here in the module, cut to a size the panel can draw without slowing down.

export type CallState = 'running' | 'done' | 'error'

export type CallRef = {
  id: string
  tool: string
  state: CallState
  startedAt: number
  endedAt?: number
  agentId?: string
}

// What an image a Read returned is: enough to draw it from its file, none of its bytes.
export type ImageFacts = {
  path: string // the file the Read named
  mime: string // what the model was sent, which can differ from the file: a large one comes back JPEG
  format: string // the file's own: PNG, JPEG, ... by its extension, else the mime
  width?: number
  height?: number
  bytes?: number
  png?: string // a PNG the terminal can read: the file itself, or a converted copy
  problem?: string // why there is no PNG to show
}

export type CallBody = {
  input: unknown
  result?: unknown // the tool's own record, or the stored error
  text?: string // the result as the model read it
  image?: ImageFacts
}

export const MAX_CALLS = 300
const TEXT_MAX = 40_000 // characters of a result's text kept
const RESULT_MAX = 120_000 // characters of a result record's JSON kept; past it, the text stands in
const STRING_MAX = 20_000 // characters of any one string inside a record or an input

const bodies = new Map<string, CallBody>()

// Strings inside a value cut to STRING_MAX, so a Read of a large file or a big Write stays light.
function trimStrings(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > STRING_MAX ? `${value.slice(0, STRING_MAX)}\n⋯ (${value.length - STRING_MAX} more characters)` : value
  if (depth > 12 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 2000).map(v => trimStrings(v, depth + 1))
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, trimStrings(v, depth + 1)]))
}

function sizeOf(value: unknown) {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return Infinity
  }
}

export function begin(id: string, input: unknown) {
  bodies.set(id, { input: trimStrings(input) })
  if (bodies.size > MAX_CALLS * 2) bodies.delete(bodies.keys().next().value!)
}

// A PNG's size from its header (IHDR), when the Read gave none: bytes 16-23 of the file.
function pngSize(base64: string): { width: number; height: number } | null {
  try {
    const head = atob(base64.slice(0, 44))
    if (!head.startsWith('\x89PNG')) return null
    const at = (i: number) => ((head.charCodeAt(i) << 24) | (head.charCodeAt(i + 1) << 16) | (head.charCodeAt(i + 2) << 8) | head.charCodeAt(i + 3)) >>> 0
    return { width: at(16), height: at(20) }
  } catch {
    return null
  }
}

// An image a Read returned: its facts kept, its base64 dropped from the stored record.
function imageOf(input: unknown, result: unknown): ImageFacts | undefined {
  const r = (result ?? {}) as { type?: unknown; file?: Record<string, unknown> }
  if (r.type !== 'image' || !r.file) return undefined
  const f = r.file
  const dims = (f.dimensions ?? {}) as Record<string, unknown>
  const base64 = typeof f.base64 === 'string' ? f.base64 : ''
  const fromHeader = dims.originalWidth ? null : pngSize(base64)
  const path = String((input as { file_path?: unknown } | undefined)?.file_path ?? '')
  const mime = String(f.type ?? 'image/png')
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
  const format = ext && ext.length <= 5 ? (ext === 'jpg' ? 'jpeg' : ext) : mime.replace(/^image\//, '')
  return {
    path,
    mime,
    format: format.toUpperCase(),
    width: Number(dims.originalWidth ?? dims.displayWidth ?? fromHeader?.width) || undefined,
    height: Number(dims.originalHeight ?? dims.displayHeight ?? fromHeader?.height) || undefined,
    bytes: typeof f.originalSize === 'number' ? f.originalSize : undefined,
    // A PNG file is drawn as it is; anything else gets a PNG copy.
    ...(format === 'png' && path ? { png: path } : {}),
  }
}

export function setImagePng(id: string, png: string | undefined, problem?: string) {
  const body = bodies.get(id)
  if (!body?.image) return
  bodies.set(id, { ...body, image: { ...body.image, ...(png ? { png } : {}), ...(problem ? { problem } : {}) } })
}

export function finish(id: string, result: unknown, text: string | undefined) {
  const body = bodies.get(id) ?? { input: undefined }
  const image = imageOf(body.input, result)
  if (image) {
    const file = { ...((result as { file?: object }).file ?? {}), base64: undefined }
    bodies.set(id, { ...body, image, result: { type: 'image', file }, text: undefined })
    return
  }
  const trimmed = trimStrings(result)
  bodies.set(id, {
    ...body,
    result: sizeOf(trimmed) > RESULT_MAX ? undefined : trimmed,
    text: text === undefined ? undefined : text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n⋯ (cut short)` : text,
  })
}

export const bodyOf = (id: string): CallBody | undefined => bodies.get(id)
export const forget = () => bodies.clear()
