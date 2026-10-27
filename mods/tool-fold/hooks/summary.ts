// What one line says of a tool call: the tool, what it acted on, and how it went, read from the
// call's input and its stored result, so the folded result block need not be opened to know.

export type Tone = 'ok' | 'muted' | 'error' | 'add' | 'del' | 'warn'
export type Part = { text: string; tone: Tone }
export type Status = 'running' | 'done' | 'error' | 'interrupted'

type Row = { tool: string; input: unknown; output?: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
const lineCount = (s: string) => (s === '' ? 0 : s.replace(/\n$/, '').split('\n').length)

export function status(row: Row): Status {
  if (row.isInterrupted) return 'interrupted'
  if (row.isErrored) return 'error'
  return row.isRunning || row.output === undefined ? 'running' : 'done'
}

// `mcp__server__tool` reads as `server · tool`.
export function toolName(tool: string): string {
  const mcp = tool.match(/^mcp__(.+?)__(.+)$/)
  if (!mcp) return tool
  const server = mcp[1]!.replace(/^(claude_ai_|plugin_[^_]+_)/, '')
  return `${server} · ${mcp[2]}`
}

export function relativePath(path: string, cwd: string, home: string): string {
  if (cwd && path.startsWith(`${cwd.replace(/\/$/, '')}/`)) return path.slice(cwd.replace(/\/$/, '').length + 1)
  if (home && path.startsWith(`${home.replace(/\/$/, '')}/`)) return `~/${path.slice(home.replace(/\/$/, '').length + 1)}`
  return path
}

const SUBJECT_KEYS = ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'skill', 'description', 'subagent_type', 'path', 'action', 'prompt']

export function subject(row: Row, cwd: string, home: string): string {
  const input = obj(row.input)
  const path = (key: string) => relativePath(str(input[key]), cwd, home)
  switch (row.tool) {
    case 'Bash':
      return oneLine(str(input.command))
    case 'Read': {
      const from = typeof input.offset === 'number' ? input.offset : undefined
      const count = typeof input.limit === 'number' ? input.limit : undefined
      return path('file_path') + (from !== undefined ? `:${from}${count !== undefined ? `-${from + count - 1}` : ''}` : '')
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return path('file_path')
    case 'NotebookEdit':
      return path('notebook_path')
    case 'Grep':
      return `${str(input.pattern)}${input.path ? `  in ${path('path')}` : ''}`
    case 'WebFetch': {
      const url = str(input.url)
      return url.replace(/^https?:\/\//, '')
    }
    case 'Agent':
    case 'Task':
      return oneLine(str(input.description) || str(input.subagent_type) || str(input.prompt))
    case 'AskUserQuestion': {
      const q = Array.isArray(input.questions) ? obj(input.questions[0]) : {}
      return oneLine(str(q.question) || str(q.header))
    }
    case 'ExitPlanMode':
      return 'plan ready for review'
    case 'TaskCreate':
      return oneLine(str(input.subject))
    case 'TaskUpdate':
      return `#${str(input.taskId)}${input.status ? ` → ${str(input.status)}` : ''}${input.subject ? ` ${oneLine(str(input.subject))}` : ''}`
    case 'TaskGet':
    case 'TaskStop':
      return `#${str(input.taskId) || str(input.task_id)}`
    case 'LSP':
      return `${str(input.operation)} ${relativePath(str(input.filePath), cwd, home)}:${String(input.line ?? '')}`
    case 'ScheduleWakeup':
      return input.stop ? 'stop the loop' : oneLine(`in ${String(input.delaySeconds ?? '?')}s · ${str(input.reason)}`)
    case 'CronCreate':
      return `${str(input.cron)}  ${oneLine(str(input.prompt))}`
    case 'SendMessage':
      return `→ ${typeof input.to === 'string' ? input.to : 'agent'}  ${oneLine(str(input.summary) || str(input.message))}`
    case 'Workflow':
      return oneLine(str(input.name) || str(input.title) || str(input.description) || 'workflow')
    case 'ReadMcpResourceTool':
      return `${str(input.server)} ${str(input.uri)}`
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : []
      const now = todos.find(t => t.status === 'in_progress')
      return now ? str(now.activeForm) || str(now.content) : `${todos.filter(t => t.status === 'completed').length}/${todos.length} done`
    }
    default: {
      // A database call reads as its namespace; any other MCP call as its first short text field.
      if (row.tool.startsWith('mcp__')) {
        const ns = [str(input.database), str(input.collection)].filter(Boolean).join('.')
        if (ns) return ns
        const first = Object.entries(input).find(([k, v]) => typeof v === 'string' && v !== '' && !/^(connectionId|id)$/i.test(k))
        if (first) return oneLine(str(first[1]))
      }
      const key = SUBJECT_KEYS.find(k => typeof input[k] === 'string' && input[k] !== '')
      if (key) return oneLine(key.endsWith('path') ? path(key) : str(input[key]))
      const keys = Object.keys(input)
      return keys.length > 0 ? oneLine(JSON.stringify(input)) : ''
    }
  }
}

// How the call went, as a few short parts; empty while it runs.
export function meta(row: Row): Part[] {
  const s = status(row)
  if (s === 'running') return [{ text: 'running…', tone: 'muted' }]
  if (s === 'interrupted') return [{ text: 'interrupted', tone: 'error' }]
  if (s === 'error') {
    const first = oneLine(typeof row.output === 'string' ? row.output : str(obj(row.output).error) || 'error').replace(/^Error:\s*/, '')
    return [{ text: first || 'error', tone: 'error' }]
  }
  const out = obj(row.output)
  switch (row.tool) {
    case 'Bash': {
      if (out.backgroundTaskId !== undefined) return [{ text: 'background', tone: 'warn' }]
      if (out.timedOutAfterMs !== undefined) return [{ text: 'timed out', tone: 'error' }]
      const lines = lineCount(str(out.stdout))
      const errs = lineCount(str(out.stderr))
      return [
        { text: lines === 0 ? 'no output' : plural(lines, 'line'), tone: 'muted' },
        ...(errs > 0 ? [{ text: `stderr ${errs}`, tone: 'warn' as Tone }] : []),
      ]
    }
    case 'Read': {
      const file = obj(out.file)
      if (out.type === 'image') {
        const d = obj(file.dimensions)
        const w = d.originalWidth ?? d.displayWidth
        const h = d.originalHeight ?? d.displayHeight
        const size = typeof file.originalSize === 'number' ? (file.originalSize < 1024 * 1024 ? `${(file.originalSize / 1024).toFixed(0)} KB` : `${(file.originalSize / 1024 / 1024).toFixed(1)} MB`) : ''
        return [{ text: ['image', typeof w === 'number' && typeof h === 'number' ? `${w}×${h}` : '', size].filter(Boolean).join(' · '), tone: 'muted' }]
      }
      const n = typeof file.numLines === 'number' ? file.numLines : lineCount(str(file.content))
      const total = typeof file.totalLines === 'number' ? file.totalLines : undefined
      return [{ text: total !== undefined && total > n ? `${n} of ${plural(total, 'line')}` : plural(n, 'line'), tone: 'muted' }]
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      const hunks = Array.isArray(out.structuredPatch) ? (out.structuredPatch as { lines?: unknown }[]) : []
      const lines = hunks.flatMap(h => (Array.isArray(h.lines) ? (h.lines as string[]) : []))
      const adds = lines.filter(l => l.startsWith('+')).length
      const dels = lines.filter(l => l.startsWith('-')).length
      if (row.tool === 'Write' && out.type === 'create') return [{ text: `new · ${plural(lineCount(str(out.content)), 'line')}`, tone: 'add' }]
      return [
        { text: `+${adds}`, tone: 'add' },
        { text: `−${dels}`, tone: 'del' },
      ]
    }
    case 'WebFetch':
      return typeof out.code === 'number'
        ? [{ text: `${out.code}`, tone: out.code < 400 ? 'muted' : 'error' }, { text: `${Math.max(1, Math.round(Number(out.bytes ?? 0) / 1024))} KB`, tone: 'muted' }]
        : []
    default:
      return []
  }
}
