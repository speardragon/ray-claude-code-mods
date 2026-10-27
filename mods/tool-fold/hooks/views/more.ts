// Views for the rest of Claude Code's own tools: a skill as a badge, a question as its options with
// the answer picked, a plan as a document, tasks as a board, a tool search as the tools it loaded,
// LSP as locations, schedules as a clock card, messages as bubbles, a workflow as a run card, an MCP
// resource as its contents, a worktree as a banner. Each returns null for a tool it does not draw.
import type { Line, Span } from './kit'
import { P, badge, blank, fill, frame, s, section, spread, textRows, wrap } from './kit'
import type { ViewInput } from './tools'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const AMBER = '#d29922'
const VIOLET = '#d2a8ff'

// Markdown-ish text: headings bold, bullets and checkboxes kept, code fences dimmed, the rest wrapped.
export function markdownish(text: string, width: number, max = 800): Line[] {
  let inCode = false
  return text.split('\n').slice(0, max).flatMap(line => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      return [[s(line.trim() === '```' ? '' : `‹${line.trim().slice(3)}›`, { color: P.subtle })]]
    }
    if (inCode) return wrap([s(line, { color: '#a5d6ff', backgroundColor: P.panel })], width).map(r => fill(r, width, P.panel))
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) return wrap([s(`${h[1]} `, { color: P.subtle, weight: 'bold' }), s(h[2]!.replace(/\*\*/g, ''), { color: P.fg, weight: 'bold' })], width)
    const task = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (task) return wrap([s(`${task[1]}${task[2] === ' ' ? '☐ ' : '☑ '}`, { color: task[2] === ' ' ? P.subtle : P.ok }), s(task[3]!, { color: P.text })], width, [s(`${task[1]}  `)])
    const b = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (b) return wrap([s(`${b[1]}${/\d/.test(b[2]!) ? b[2] : '•'} `, { color: P.accent }), s(b[3]!.replace(/\*\*/g, ''), { color: P.text })], width, [s(`${b[1]}  `)])
    if (/^\s*>/.test(line)) return wrap([s('▌ ', { color: P.faint }), s(line.replace(/^\s*>\s?/, ''), { color: P.muted, italic: true })], width, [s('  ')])
    return wrap([s(line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'), { color: P.text })], width)
  })
}

function skill(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const name = str(i.skill) || str(out.commandName)
  const rows: Line[] = [blank(), [s('✦ ', { color: AMBER, weight: 'bold' }), s(name, { color: P.fg, weight: 'bold' })], [s(v.state === 'running' ? 'Loading skill…' : v.state === 'error' ? 'The skill did not load' : 'Skill loaded', { color: v.state === 'error' ? P.err : P.muted })]]
  if (i.args) rows.push(blank(), [badge(str(i.args), AMBER, '#3a2c08')])
  const tools = arr(out.allowedTools)
  if (tools.length) rows.push(blank(), section('ALLOWED TOOLS'), ...wrap(tools.flatMap(t => [badge(str(t), P.muted, P.bar), s(' ')]), v.width))
  if (out.model) rows.push(blank(), [s('model  ', { color: P.muted }), s(str(out.model), { color: P.text })])
  return frame(rows, v.width, [s('Skill', { color: AMBER, weight: 'bold' })], P.panel, '#5c4813')
}

// Each question, its options, the one the person picked lit.
function ask(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const answers = obj(out.answers ?? i.answers)
  const rows: Line[] = []
  for (const q of arr(out.questions ?? i.questions).map(obj)) {
    const question = str(q.question)
    const picked = str(answers[question])
    const chosen = new Set(picked.split(', ').filter(Boolean))
    rows.push([badge(str(q.header) || 'Question', P.accent, '#0c2d6b')], ...wrap([s(question, { color: P.fg, weight: 'bold' })], v.width), blank())
    for (const o of arr(q.options).map(obj)) {
      const label = str(o.label)
      const isPicked = chosen.has(label)
      const mark = q.multiSelect ? (isPicked ? '☑ ' : '☐ ') : isPicked ? '◉ ' : '○ '
      rows.push(...wrap([s(mark, { color: isPicked ? P.ok : P.subtle }), s(label, { color: isPicked ? P.fg : P.text, weight: isPicked ? 'bold' : undefined })], v.width, [s('  ')]).map(r => (isPicked ? fill(r, v.width, '#0f2a1a') : r)))
      if (o.description) rows.push(...wrap([s(`  ${str(o.description)}`, { color: P.subtle })], v.width, [s('  ')]))
    }
    const custom = picked && ![...chosen].every(c => arr(q.options).some(o => str(obj(o).label) === c))
    if (custom) rows.push(...wrap([s('✎ ', { color: P.ok }), s(picked, { color: P.fg })], v.width, [s('  ')]))
    if (!picked && v.state !== 'running') rows.push([s('(no answer)', { color: P.subtle, italic: true })])
    rows.push(blank())
  }
  if (v.state === 'running') rows.push([s('◐ Waiting for your answer…', { color: P.warn })])
  return rows
}

function plan(v: ViewInput): Line[] {
  const out = obj(v.result)
  if (v.tool === 'EnterPlanMode') return frame([[s('◇ Plan mode', { color: P.accent, weight: 'bold' })], [s('Claude explores and plans before it changes anything.', { color: P.muted })]], v.width)
  const text = str(out.plan) || str(v.text)
  const rows: Line[] = [spread([s('◆ Plan', { color: P.accent, weight: 'bold' }), ...(out.filePath ? [s(`  ${str(out.filePath)}`, { color: P.subtle })] : [])], [...(out.planWasEdited ? [badge('edited', AMBER, '#3a2c08')] : [])], v.width), blank()]
  return [...rows, ...markdownish(text, v.width)]
}

const TASK_MARK: Record<string, Span> = {
  completed: s('✓ ', { color: P.ok }),
  in_progress: s('◐ ', { color: P.warn }),
  pending: s('○ ', { color: P.subtle }),
  deleted: s('✗ ', { color: P.err }),
}

function taskLine(t: Record<string, unknown>, width: number): Line[] {
  const status = str(t.status) || 'pending'
  const label = status === 'in_progress' ? str(t.activeForm) || str(t.subject) : str(t.subject)
  const blocked = arr(t.blockedBy).length ? [s(`  blocked by ${arr(t.blockedBy).join(', ')}`, { color: P.err })] : []
  return wrap([TASK_MARK[status] ?? TASK_MARK.pending!, s(`#${str(t.id)} `, { color: P.subtle }), s(label, status === 'completed' ? { color: P.subtle, strikethrough: true } : { color: status === 'in_progress' ? P.fg : P.text, weight: status === 'in_progress' ? 'bold' : undefined }), ...(t.owner ? [s(`  @${str(t.owner)}`, { color: VIOLET })] : []), ...blocked], width, [s('    ')])
}

function tasks(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  if (v.tool === 'TaskList') {
    const list = arr(out.tasks).map(obj)
    const done = list.filter(t => t.status === 'completed').length
    const w = Math.max(10, v.width - 16)
    const filled = list.length ? Math.round((done / list.length) * w) : 0
    return [spread([s('Tasks', { color: P.fg, weight: 'bold' })], [s(`${done}/${list.length}`, { color: P.muted })], v.width), [s('█'.repeat(filled), { color: P.accent }), s('░'.repeat(w - filled), { color: P.faint })], blank(), ...list.flatMap(t => taskLine(t, v.width))]
  }
  if (v.tool === 'TaskCreate' || v.tool === 'TaskGet') {
    const t = { ...obj(out.task), ...(v.tool === 'TaskCreate' ? { subject: i.subject, activeForm: i.activeForm } : {}) }
    const rows = [[s(v.tool === 'TaskCreate' ? '+ New task' : 'Task', { color: P.accent, weight: 'bold' })], blank(), ...taskLine(t, v.width)]
    const desc = str(obj(out.task).description) || str(i.description)
    if (desc) rows.push(blank(), ...markdownish(desc, v.width, 40))
    return rows
  }
  // TaskUpdate, TaskStop: what changed.
  const change = obj(out.statusChange)
  const rows: Line[] = [[s(`Task #${str(i.taskId) || str(out.taskId)}`, { color: P.fg, weight: 'bold' })], blank()]
  if (change.from || change.to) rows.push([s('status  ', { color: P.muted }), ...(change.from ? [TASK_MARK[str(change.from)] ?? s(''), s(str(change.from), { color: P.subtle }), s('  →  ', { color: P.muted })] : []), TASK_MARK[str(change.to)] ?? s(''), s(str(change.to), { color: P.fg, weight: 'bold' })])
  for (const f of arr(out.updatedFields).map(str).filter(f => f !== 'status')) rows.push(...wrap([s(f.padEnd(8), { color: P.muted }), s(str(i[f]), { color: P.text })], v.width, [s(' '.repeat(8))]))
  if (out.error) rows.push([s(str(out.error), { color: P.err })])
  return rows
}

function toolSearch(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const matches = arr(out.matches).map(str)
  const rows: Line[] = [fill([s(' ⌕ ', { color: P.muted, backgroundColor: P.bar }), s(str(i.query), { color: P.fg, weight: 'bold', backgroundColor: P.bar })], v.width, P.bar), blank(), section('LOADED', `${matches.length} of ${str(out.total_deferred_tools) || '?'} deferred tools`)]
  for (const m of matches) {
    const mcp = m.match(/^mcp__(.+?)__(.+)$/)
    rows.push(mcp ? [s('◇ ', { color: P.accent }), s(mcp[2]!, { color: P.fg }), s(`  ${mcp[1]!.replace(/^(claude_ai_|plugin_[^_]+_)/, '')}`, { color: P.subtle })] : [s('◇ ', { color: P.accent }), s(m, { color: P.fg })])
  }
  const failed = Object.keys(obj(out.failed_mcp_servers))
  if (failed.length) rows.push(blank(), [s(`✗ failed: ${failed.join(', ')}`, { color: P.err })])
  return rows
}

function lsp(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const where = `${str(i.filePath).replace(`${v.cwd}/`, '')}:${str(i.line)}:${str(i.character)}`
  const rows: Line[] = [spread([badge(str(i.operation), P.accent, '#0c2d6b'), s(`  ${where}`, { color: P.muted })], [s(out.resultCount !== undefined ? `${str(out.resultCount)} results` : '', { color: P.muted })], v.width), blank()]
  for (const line of str(out.result).split('\n').slice(0, 300)) {
    const m = line.match(/^(.*?):(\d+):(\d+)(.*)$/)
    rows.push(...(m ? wrap([s(m[1]!.replace(`${v.cwd}/`, ''), { color: P.accent }), s(`:${m[2]}:${m[3]}`, { color: P.subtle }), s(m[4]!, { color: P.text })], v.width, [s('  ')]) : wrap([s(line, { color: P.text })], v.width)))
  }
  return rows
}

function when(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function schedule(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const rows: Line[] = []
  if (v.tool === 'ScheduleWakeup') {
    rows.push([s('◷ ', { color: P.accent }), s(i.stop ? 'Loop stopped' : `Wakes in ${str(out.clampedDelaySeconds) || str(i.delaySeconds)}s`, { color: P.fg, weight: 'bold' }), ...(out.scheduledFor ? [s(`  at ${when(Number(out.scheduledFor))}`, { color: P.muted })] : [])])
    if (i.reason) rows.push(...wrap([s(str(i.reason), { color: P.muted, italic: true })], v.width - 4))
  } else if (v.tool === 'Monitor') {
    rows.push([s('◉ Monitoring  ', { color: P.accent, weight: 'bold' }), s(str(i.description), { color: P.fg })], ...(i.command ? wrap([s('$ ', { color: P.ok }), s(str(i.command), { color: P.text })], v.width - 4) : []), [s(`timeout ${Math.round(Number(i.timeout_ms ?? out.timeoutMs ?? 0) / 1000)}s${out.taskId ? ` · task ${str(out.taskId)}` : ''}`, { color: P.subtle })])
  } else {
    rows.push([s('◷ ', { color: P.accent }), s(str(out.humanSchedule) || str(i.cron), { color: P.fg, weight: 'bold' }), ...(i.cron ? [s(`  ${str(i.cron)}`, { color: P.subtle })] : []), ...(out.recurring ?? i.recurring ? [s('  '), badge('recurring', P.accent, '#0c2d6b')] : [])])
    if (out.nextFireAt) rows.push([s(`next at ${when(Number(out.nextFireAt))}`, { color: P.muted })])
    if (out.id) rows.push([s(`id ${str(out.id)}`, { color: P.subtle })])
    if (v.tool === 'CronList') rows.push(...textRows(str(v.text), v.width - 4, { color: P.text }))
  }
  if (i.prompt) rows.push(blank(), ...textRows(str(i.prompt), v.width - 4, { color: P.text }, true, 12))
  return frame(rows, v.width, [s(v.tool, { color: P.muted })])
}

function message(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const to = typeof i.to === 'string' ? i.to : JSON.stringify(i.to ?? 'you')
  const head: Line = v.tool === 'PushNotification' ? [s('◉ Notification', { color: P.fg, weight: 'bold' }), s(out.pushSent ? '  sent to your phone' : out.localSent ? '  shown here' : out.disabledReason ? `  not sent: ${str(out.disabledReason)}` : '', { color: P.muted })] : [s('→ ', { color: VIOLET }), s(to, { color: VIOLET, weight: 'bold' })]
  const body = str(i.message) || str(i.text)
  return [head, ...(i.summary ? [[s(str(i.summary), { color: P.muted })]] : []), blank(), ...frame(markdownish(body, v.width - 4, 200), v.width, [], '#1a1530', '#6e5494')]
}

function workflow(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  const rows: Line[] = [
    spread([s('⚙ ', { color: P.accent }), s(str(out.workflowName) || str(i.name) || str(i.title) || 'Workflow', { color: P.fg, weight: 'bold' })], [badge(str(out.status) || v.state, P.accent, '#0c2d6b')], v.width - 4, P.panel),
  ]
  if (i.description) rows.push(...wrap([s(str(i.description), { color: P.muted })], v.width - 4))
  for (const [k, label] of [['runId', 'run'], ['taskId', 'task'], ['scriptPath', 'script']] as const) if (out[k]) rows.push([s(label.padEnd(8), { color: P.muted }), s(str(out[k]), { color: P.text })])
  if (out.summary) rows.push(blank(), ...markdownish(str(out.summary), v.width - 4, 40))
  if (out.warning) rows.push([s(`⚠ ${str(out.warning)}`, { color: AMBER })])
  return frame(rows, v.width)
}

function resource(v: ViewInput): Line[] {
  const i = obj(v.input)
  const out = obj(v.result)
  if (v.tool === 'ListMcpResourcesTool') {
    const list = (Array.isArray(v.result) ? v.result : []).map(obj)
    return [section('RESOURCES', `${list.length}${i.server ? ` · ${str(i.server)}` : ''}`), ...list.flatMap(r => wrap([s('▤ ', { color: P.accent }), s(str(r.name) || str(r.uri), { color: P.fg }), s(`  ${str(r.uri)}`, { color: P.subtle })], v.width, [s('  ')]))]
  }
  const rows: Line[] = [[s(`${str(i.server)} · `, { color: P.muted }), s(str(i.uri), { color: P.fg, weight: 'bold' })], blank()]
  for (const c of arr(out.contents).map(obj)) {
    if (c.mimeType) rows.push([badge(str(c.mimeType), P.muted, P.bar)])
    rows.push(...(str(c.mimeType).includes('markdown') ? markdownish(str(c.text), v.width) : textRows(str(c.text) || '(binary)', v.width, { color: P.text }, true, 600)))
  }
  if (out.error) rows.push([s(str(out.error), { color: P.err })])
  return rows
}

function worktree(v: ViewInput): Line[] {
  const out = obj(v.result)
  const entering = v.tool === 'EnterWorktree'
  return frame([[s(entering ? '⑂ Entered worktree' : '⑂ Left worktree', { color: P.accent, weight: 'bold' })], ...(out.worktreePath ? [[s(str(out.worktreePath), { color: P.fg })]] : []), ...(out.worktreeBranch ? [[s('branch  ', { color: P.muted }), s(str(out.worktreeBranch), { color: P.ok })]] : []), ...(out.message ? wrap([s(str(out.message), { color: P.muted })], v.width - 4) : [])], v.width)
}

export function moreView(v: ViewInput): Line[] | null {
  switch (v.tool) {
    case 'Skill':
      return skill(v)
    case 'AskUserQuestion':
      return ask(v)
    case 'ExitPlanMode':
    case 'EnterPlanMode':
      return plan(v)
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
    case 'TaskStop':
      return tasks(v)
    case 'ToolSearch':
      return toolSearch(v)
    case 'LSP':
      return lsp(v)
    case 'ScheduleWakeup':
    case 'Monitor':
    case 'CronCreate':
    case 'CronList':
    case 'CronDelete':
      return schedule(v)
    case 'SendMessage':
    case 'SendUserMessage':
    case 'PushNotification':
      return message(v)
    case 'Workflow':
      return workflow(v)
    case 'ReadMcpResourceTool':
    case 'ListMcpResourcesTool':
      return resource(v)
    case 'EnterWorktree':
    case 'ExitWorktree':
      return worktree(v)
    default:
      return null
  }
}
