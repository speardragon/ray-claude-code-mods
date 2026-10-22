// The prompts already in this session's transcript file, read once when the mod loads: the rows a
// person typed (origin `human`), less slash commands, their output and the engine's own notes.
// A transcript soon outgrows what `$.fs.read` takes (4 MiB), so the rows are picked out with grep
// by HUMAN_MARK first, and only those reach the parser.
import type { Prompt } from '../types'

type Block = { type?: string; text?: string }
type Row = {
  type?: string
  uuid?: string
  timestamp?: string
  isMeta?: boolean
  isSidechain?: boolean
  origin?: { kind?: string }
  message?: { role?: string; content?: string | Block[] }
}

// Where Claude Code keeps a session's transcript: the project folder is the cwd with every
// character but letters and digits turned into `-`.
export const HUMAN_MARK = '"origin":{"kind":"human"}'

export const transcriptPath = (configDir: string, cwd: string, sessionId: string) =>
  `${configDir.replace(/\/$/, '')}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`

// The text a person typed, from a row's content; null for a command, its output or a note.
export function promptText(content: string | Block[] | undefined): string | null {
  const text = typeof content === 'string'
    ? content
    : (content ?? []).filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n')
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/^<(command-name|command-message|local-command-stdout|local-command-stderr|bash-input|bash-stdout|bash-stderr|task-notification|system-reminder)>/.test(trimmed)) return null
  if (trimmed.startsWith('[Request interrupted')) return null
  return trimmed
}

export function parseTranscript(jsonl: string): Prompt[] {
  const out: Prompt[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"type":"user"')) continue // most rows are not; skip the parse
    let row: Row
    try {
      row = JSON.parse(line) as Row
    } catch {
      continue
    }
    if (row.type !== 'user' || row.isMeta || row.isSidechain || !row.uuid) continue
    if (row.origin?.kind !== undefined && row.origin.kind !== 'human') continue
    if (row.origin?.kind === undefined && Array.isArray(row.message?.content) && row.message.content.some(b => b.type === 'tool_result')) continue
    const text = promptText(row.message?.content)
    const at = row.timestamp ? Date.parse(row.timestamp) : NaN
    if (text === null || Number.isNaN(at)) continue
    out.push({ uuid: row.uuid, text, at })
  }
  return out
}
