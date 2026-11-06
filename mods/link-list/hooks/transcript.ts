// The replies already in this session's transcript file, read once when the mod loads. A transcript
// soon outgrows what `$.fs.read` takes, so grep picks out the main conversation's assistant rows
// that hold text and a URL, and only those reach the parser.
import type { Group } from '../types'
import { groupOf, replyText } from './collect'

type Row = {
  type?: string
  uuid?: string
  timestamp?: string
  isSidechain?: boolean
  message?: { content?: string | { type?: string; text?: string }[] }
}

// Where Claude Code keeps a session's transcript: the project folder is the cwd with every
// character but letters and digits turned into `-`.
export const transcriptPath = (configDir: string, cwd: string, sessionId: string) =>
  `${configDir.replace(/\/$/, '')}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`

export const PICK = `grep -F '"type":"assistant"' "$1" | grep -F '"type":"text"' | grep -F 'http'`

export function parseTranscript(jsonl: string): Group[] {
  const out: Group[] = []
  for (const line of jsonl.split('\n')) {
    let row: Row
    try {
      row = JSON.parse(line) as Row
    } catch {
      continue
    }
    if (row.type !== 'assistant' || row.isSidechain || !row.uuid) continue
    const at = row.timestamp ? Date.parse(row.timestamp) : NaN
    if (Number.isNaN(at)) continue
    const group = groupOf(row.uuid, replyText(row.message?.content), at)
    if (group) out.push(group)
  }
  return out
}
