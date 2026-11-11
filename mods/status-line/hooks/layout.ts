// The rows under the engine's hint line, as runs of styled text, top to bottom:
//   model and effort │ git      (the git part drops to a row of its own where it does not fit beside)
//   context window
//   the plan's limits           (stacked in more rows as the surface narrows)
import type { Effort, Git, LimitWindow, PullRequest, Usage } from '../types'
import { EFFORT_LEVELS } from './effort'
import type { ResetStyle } from './format'
import { formatTokens, prettyModel, resetIn } from './format'
import { pullRequestColor } from './pr'
import { textWidth, truncate, truncateStart } from './text'
import type { Span } from './theme'
import { T, span, statusOf } from './theme'

const MIN_BRANCH_COLUMNS = 12
const MIN_PATH_COLUMNS = 10
const SAME_INSTANT_MS = 60_000
const PERCENT = 100
const PIPE: readonly Span[] = [span(' '), span('│', { color: T.faint }), span(' ')]

type Variant = { bar: number; hasExtras: boolean }

// How a meter is drawn, widest first: a long bar with its detail, down to a short bar alone.
const VARIANTS: readonly Variant[] = [
  { bar: 10, hasExtras: true },
  { bar: 6, hasExtras: true },
  { bar: 6, hasExtras: false },
  { bar: 4, hasExtras: false },
]

const SEPARATOR: readonly Span[] = [span(' '), span(T.separator, { color: T.faint }), span(' ')]

export const rowWidth = (row: readonly Span[]) => row.reduce((sum, part) => sum + textWidth(part.text), 0)
export const rowText = (row: readonly Span[]) => row.map(part => part.text).join('')

const join = (groups: readonly (readonly Span[])[], separator: readonly Span[] = SEPARATOR): Span[] =>
  groups.filter(group => group.length > 0).flatMap((group, index) => (index === 0 ? group : [...separator, ...group]))

// Filled dots and the level's name in the level's color; the dots not reached are left dim.
export function effortSpans(effort: Effort): Span[] {
  if (effort.kind === 'none') return []
  if (effort.kind === 'unknown') return [span('  effort ?', { color: T.label })]
  const lit = EFFORT_LEVELS.indexOf(effort.level) + 1
  if (lit === 0) return [span(`  ${effort.level}`)]
  const paint = { color: T.effort[effort.level] ?? T.brand, weight: 'bold' } as const
  const off = T.effortOff.repeat(EFFORT_LEVELS.length - lit)
  return [
    span('  '),
    span(T.effortOn.repeat(lit), paint),
    ...(off === '' ? [] : [span(off, { color: T.muted })]),
    span(` ${effort.level}`, paint),
  ]
}

// A `color` of its own paints the label and the bar, in place of the muted label and the status color.
type Meter = { label: string; used?: number; value: string; extra?: string; color?: string }

// One rounded percentage gives the number, the fill, the color and the warning mark, so they agree.
function meterSpans(meter: Meter, variant: Variant): Span[] {
  const used = meter.used ?? 0
  const status = statusOf(Math.max(0, PERCENT - used))
  const color = meter.used === undefined ? T.muted : (meter.color ?? T.status[status])
  const filled = used <= 0 ? 0 : Math.min(variant.bar, Math.max(1, Math.round((used / PERCENT) * variant.bar)))
  return [
    span(`${meter.label} `, { color: meter.color ?? T.label }),
    span(T.filled.repeat(filled), { color }),
    span(T.track.repeat(variant.bar - filled), { color, dimColor: true }),
    span(` ${meter.value}`, { weight: 'bold' }),
    ...(meter.used !== undefined && status === 'critical' ? [span(' !', { color: T.status.critical, weight: 'bold' })] : []),
    ...(meter.extra !== undefined && variant.hasExtras ? [span(`  ${meter.extra}`, { color: T.label })] : []),
  ]
}

function contextMeter(context: Usage['context']): Meter {
  const size = context.window > 0 ? formatTokens(context.window) : '?'
  if (context.tokens === undefined) return { label: 'ctx', value: '—', extra: `—/${size}` }
  const ratio = context.window > 0 ? (context.tokens / context.window) * PERCENT : 0
  const used = Math.round(context.percent ?? ratio)
  return { label: 'ctx', used, value: `${used}%`, extra: `${formatTokens(context.tokens)}/${size}` }
}

function limitMeter(label: string, window: LimitWindow, now: number, style: ResetStyle | undefined): Meter {
  const used = Math.round(window.percentUsed)
  const reset = style === undefined ? undefined : resetIn(window.resetsAt, now, style)
  return { label, used, value: `${used}%`, ...(reset ? { extra: `${T.reset}${reset}` } : {}) }
}

const isSameInstant = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && Math.abs(Date.parse(a) - Date.parse(b)) < SAME_INSTANT_MS

// A Fable limit that starts over with the weekly one leaves the countdown to the weekly meter.
function fableMeter(fable: LimitWindow, sevenDay: LimitWindow | undefined, now: number): Meter {
  const meter = limitMeter('fable', fable, now, isSameInstant(fable.resetsAt, sevenDay?.resetsAt) ? undefined : 'hours')
  return { ...meter, color: T.fable }
}

// Meters side by side while they fit, each on the next row when it does not.
function pack(meters: readonly Span[][], columns: number): Span[][] {
  return meters.reduce<Span[][]>((rows, meter) => {
    const last = rows.at(-1)
    const joined = last === undefined ? meter : join([last, meter])
    if (last !== undefined && rowWidth(joined) <= columns) return [...rows.slice(0, -1), joined]
    return [...rows, meter]
  }, [])
}

const fits = (rows: readonly Span[][], columns: number) => rows.every(row => rowWidth(row) <= columns)

// Meters in as few rows as the width allows and, among those, the widest drawing.
function stack(meters: readonly Meter[], columns: number): Span[][] {
  if (meters.length === 0) return []
  const packings = VARIANTS.map(variant => pack(meters.map(meter => meterSpans(meter, variant)), columns))
  const fitting = packings.filter(rows => fits(rows, columns))
  const fewest = Math.min(...fitting.map(rows => rows.length))
  return fitting.find(rows => rows.length === fewest) ?? packings.at(-1) ?? []
}

// Only the number carries the state's color; the whole of it opens the pull request.
const pullRequestSpans = (pr: PullRequest): Span[] => [
  span('PR ', { color: T.label }, pr.url),
  span(`#${pr.number}`, { color: pullRequestColor(pr), weight: 'bold', underline: true }, pr.url),
]

type GitCut = { branch: number; path: number }

const UNCUT: GitCut = { branch: Number.POSITIVE_INFINITY, path: Number.POSITIVE_INFINITY }

function gitSpans(git: Git, pr: PullRequest | undefined, cut: GitCut): Span[] {
  // A detached HEAD shows its commit where the branch would be, as starship's git_commit does.
  const head =
    git.branch === undefined
      ? span(`(${git.commit ?? '?'})`, { color: T.commit, weight: 'bold' })
      : span(truncate(git.branch, cut.branch), { color: T.branch, weight: 'bold' })
  const operation = git.operation ? [span(` (${git.operation.toUpperCase()})`, { color: T.gitStatus, weight: 'bold' })] : []
  return join([
    [span(truncateStart(git.path, cut.path), { color: T.path, weight: 'bold' })],
    [head, ...operation],
    pr ? pullRequestSpans(pr) : [],
  ])
}

// ~/path/to/project · branch (OPERATION) · PR #n. Too wide, the branch is cut first, then the path
// from its start (the folder's own name is the part worth keeping), then the pull request is left out.
export function gitRows(git: Git | null, pr: PullRequest | undefined, columns: number): Span[][] {
  if (git === null) return []
  const branchWidth = textWidth(git.branch ?? '')
  const pathWidth = textWidth(git.path)
  const attempts = (pr ? [pr, undefined] : [undefined]).flatMap(shown => {
    const whole = gitSpans(git, shown, UNCUT)
    const branch = Math.max(Math.min(branchWidth, MIN_BRANCH_COLUMNS), branchWidth - (rowWidth(whole) - columns))
    const cutBranch = gitSpans(git, shown, { ...UNCUT, branch })
    const path = Math.max(Math.min(pathWidth, MIN_PATH_COLUMNS), pathWidth - (rowWidth(cutBranch) - columns))
    return [whole, cutBranch, gitSpans(git, shown, { branch, path })]
  })
  const row = attempts.find(one => rowWidth(one) <= columns) ?? attempts.at(-1)
  return row ? [row] : []
}

export type StatusInput = {
  usage: Usage
  effort: Effort
  fable: LimitWindow | undefined
  git: Git | null
  pr: PullRequest | undefined
}

const modelSpans = (usage: Usage, effort: Effort): Span[] => [
  span(`${T.mark} `, { color: T.brand }),
  span(prettyModel(usage.model), { weight: 'bold' }),
  ...effortSpans(effort),
]

// The git part sits beside the model only while it keeps its whole path and its pull request: a part
// cut down to fit would be worth less than a row of its own.
function headRows(model: Span[], git: Git | null, pr: PullRequest | undefined, columns: number): Span[][] {
  if (git === null) return [model]
  const [beside] = gitRows(git, pr, columns - rowWidth(model) - rowWidth(PIPE))
  const isWhole = beside !== undefined && !rowText(beside).startsWith('…') && (pr === undefined || rowText(beside).includes('PR '))
  if (beside !== undefined && isWhole && rowWidth(join([model, beside], PIPE)) <= columns) return [join([model, beside], PIPE)]
  return [model, ...gitRows(git, pr, columns)]
}

// The context window alone on its row, in the widest drawing that fits.
function contextRow(usage: Usage, columns: number): Span[] {
  const drawings = VARIANTS.map(variant => meterSpans(contextMeter(usage.context), variant))
  return drawings.find(row => rowWidth(row) <= columns) ?? drawings.at(-1) ?? []
}

export function statusRows(input: StatusInput, columns: number, now: number): Span[][] {
  const { usage, effort, fable, git, pr } = input
  const limits = [
    ...(usage.fiveHour ? [limitMeter('5h', usage.fiveHour, now, 'minutes')] : []),
    ...(usage.sevenDay ? [limitMeter('7d', usage.sevenDay, now, 'hours')] : []),
    ...(fable ? [fableMeter(fable, usage.sevenDay, now)] : []),
  ]
  return [...headRows(modelSpans(usage, effort), git, pr, columns), contextRow(usage, columns), ...stack(limits, columns)]
}
