// The rows under the engine's hint line, two blocks side by side where the width allows:
//   left, the meters   ● Model  ·  ● 컨텍스트  ·  ● 5시간 한도  ·  ● 7일 한도  ·  ● Fable 한도
//                      each a label, a bar of four segments, the figure and what it means, in columns
//   right, the facts   경로 · 브랜치 · PR · 비용 · 모드 · 에이전트, a label and its value
// Too narrow for both with the meters' details, the facts fold into rows under the left block (the
// git part, then the rest), and the left block shortens its bars, then drops its details.
import type { Agents, Effort, Git, LimitWindow, PullRequest, Usage } from '../types'
import { EFFORT_LEVELS } from './effort'
import { formatCost, formatTokens, prettyModel, resetIn } from './format'
import type { Mode } from './mode'
import { MODE_NAMES } from './mode'
import { pullRequestColor } from './pr'
import { textWidth, truncate, truncateStart } from './text'
import type { Span } from './theme'
import { T, grooveOf, span, statusOf } from './theme'

const MIN_BRANCH_COLUMNS = 12
const MIN_PATH_COLUMNS = 10
const PERCENT = 100
const SEGMENTS = 4
const EIGHTHS_PER_CELL = 8
const FIGURE_WIDTH = 5 // `!100%`: the warning mark, then the percentage right-aligned
const GAP: Span = span('  ')
const DIVIDER: readonly Span[] = [GAP, span(T.divider, { color: T.faint }), GAP]
const SEPARATOR: readonly Span[] = [span(' '), span(T.separator, { color: T.faint }), span(' ')]

// How the left block is drawn, widest first: long bars with their details, down to short labels and bars.
type Variant = { segment: number; hasDetails: boolean; isShort: boolean }

const VARIANTS: readonly Variant[] = [
  { segment: 4, hasDetails: true, isShort: false },
  { segment: 3, hasDetails: true, isShort: false },
  { segment: 2, hasDetails: true, isShort: false },
  { segment: 2, hasDetails: false, isShort: false },
  { segment: 2, hasDetails: false, isShort: true },
  { segment: 1, hasDetails: false, isShort: true },
  { segment: 0, hasDetails: false, isShort: true }, // the figure alone, for the narrowest surfaces
]

export const rowWidth = (row: readonly Span[]) => row.reduce((sum, part) => sum + textWidth(part.text), 0)
export const rowText = (row: readonly Span[]) => row.map(part => part.text).join('')

const join = (groups: readonly (readonly Span[])[], separator: readonly Span[] = SEPARATOR): Span[] =>
  groups.filter(group => group.length > 0).flatMap((group, index) => (index === 0 ? group : [...separator, ...group]))

const padTo = (row: readonly Span[], width: number): Span[] => {
  const missing = width - rowWidth(row)
  return missing > 0 ? [...row, span(' '.repeat(missing))] : [...row]
}

const isSamePaint = (a: Span, b: Span) => a.href === b.href && JSON.stringify(a.paint) === JSON.stringify(b.paint)

// Neighbouring runs of one paint as one, so a bar is a few spans and not one per cell.
const merged = (row: readonly Span[]): Span[] =>
  row.reduce<Span[]>((out, part) => {
    const last = out.at(-1)
    if (last !== undefined && isSamePaint(last, part)) return [...out.slice(0, -1), { ...last, text: last.text + part.text }]
    return [...out, part]
  }, [])

// Four segments of `segment` cells with a divider between, drawn on the fill or the track behind it so
// the bar runs on unbroken; the fill ends in an eighth of a cell, and anything used shows at least a sliver.
export function barSpans(used: number | undefined, segment: number, color: string): Span[] {
  const cells = SEGMENTS * segment
  const exact = used === undefined ? 0 : Math.round((Math.min(PERCENT, Math.max(0, used)) / PERCENT) * cells * EIGHTHS_PER_CELL)
  const units = used !== undefined && used > 0 ? Math.max(1, exact) : exact
  const cellOf = (index: number): Span => {
    const left = units - index * EIGHTHS_PER_CELL
    if (left >= EIGHTHS_PER_CELL) return span(T.filled, { color })
    // The rest of the partial cell in the track's color, so the fill meets the track with no gap.
    if (left > 0) return span(T.eighths[left] ?? T.filled, { color, backgroundColor: T.track })
    return span(T.filled, { color: T.track })
  }
  const tickAt = (index: number): Span => {
    const behind = units >= index * EIGHTHS_PER_CELL ? color : T.track
    return span(T.tick, { color: T.barTick, backgroundColor: behind })
  }
  const parts = Array.from({ length: cells }, (_, index) => [...(index > 0 && index % segment === 0 ? [tickAt(index)] : []), cellOf(index)])
  return merged(parts.flat())
}

// Five squares, the steps reached in the level's color and the rest on the track, then HIGH (3/5).
export function effortSpans(effort: Effort, hasDetails: boolean): Span[] {
  if (effort.kind === 'none') return []
  const word = hasDetails ? [span('Effort ', { color: T.muted })] : []
  if (effort.kind === 'unknown') return [...word, span('?', { color: T.muted })]
  const lit = EFFORT_LEVELS.indexOf(effort.level) + 1
  if (lit === 0) return [...word, span(effort.level.toUpperCase(), { weight: 'bold' })]
  const color = T.effort[effort.level] ?? T.brand
  const stepOf = (index: number): Span[] => {
    const fill = index < lit ? color : T.track
    const body = span(T.filled.repeat(T.effortStepCells - 1), { color: fill })
    const edge = index === 0 ? span(T.filled, { color: fill }) : span(T.effortTick, { color: grooveOf(fill), backgroundColor: fill })
    return [edge, body]
  }
  return [
    ...word,
    ...merged(EFFORT_LEVELS.flatMap((_, index) => stepOf(index))),
    span(` ${effort.level.toUpperCase()}`, { color, weight: 'bold' }),
    ...(hasDetails ? [span(` (${lit}/${EFFORT_LEVELS.length})`, { color: T.muted })] : []),
  ]
}

type Meter = { label: string; short: string; color: string; used?: number; detail?: string }

const dot = (color: string) => span(`${T.dot} `, { color })

const labelSpan = (text: string, width: number) => span(text + ' '.repeat(Math.max(0, width - textWidth(text))), { color: T.label, weight: 'bold' })

// One rounded percentage gives the fill, the figure and its color, so they agree.
function meterRow(meter: Meter, variant: Variant, labelWidth: number): Span[] {
  const used = meter.used
  const status = statusOf(Math.max(0, PERCENT - (used ?? 0)))
  const isCritical = used !== undefined && status === 'critical'
  const figure = used === undefined ? '—' : `${used}%`
  const pad = ' '.repeat(Math.max(0, FIGURE_WIDTH - 1 - figure.length))
  return [
    dot(meter.color),
    labelSpan(variant.isShort ? meter.short : meter.label, labelWidth),
    GAP,
    ...(variant.segment > 0 ? [...barSpans(used, variant.segment, meter.color), GAP] : []),
    span(isCritical ? '!' : ' ', { color: T.status.critical, weight: 'bold' }),
    span(`${pad}${figure}`, { color: used === undefined ? T.muted : T.status[status], weight: 'bold' }),
    ...(meter.detail !== undefined && variant.hasDetails ? [GAP, span(meter.detail, { color: T.muted })] : []),
  ]
}

function contextMeter(context: Usage['context']): Meter {
  const base = { label: '컨텍스트', short: '컨텍스트', color: T.meter.context }
  const size = context.window > 0 ? formatTokens(context.window) : '?'
  if (context.tokens === undefined) return { ...base, detail: `— / ${size} 토큰` }
  const ratio = context.window > 0 ? (context.tokens / context.window) * PERCENT : 0
  return { ...base, used: Math.round(context.percent ?? ratio), detail: `${formatTokens(context.tokens)} / ${size} 토큰` }
}

function limitMeter(base: Omit<Meter, 'used' | 'detail'>, window: LimitWindow, now: number): Meter {
  const left = resetIn(window.resetsAt, now)
  const detail = left === undefined ? undefined : left === '곧' ? '곧 초기화' : `${left} 후 초기화`
  return { ...base, used: Math.round(window.percentUsed), ...(detail ? { detail } : {}) }
}

function meters(usage: Usage, fable: LimitWindow | undefined, now: number): Meter[] {
  return [
    contextMeter(usage.context),
    ...(usage.fiveHour ? [limitMeter({ label: '5시간 한도', short: '5시간', color: T.meter.fiveHour }, usage.fiveHour, now)] : []),
    ...(usage.sevenDay ? [limitMeter({ label: '7일 한도', short: '7일', color: T.meter.sevenDay }, usage.sevenDay, now)] : []),
    ...(fable ? [limitMeter({ label: 'Fable 한도', short: 'Fable', color: T.meter.fable }, fable, now)] : []),
  ]
}

// The model row keeps the label column while the details show; shorter, it drops it to fit.
function modelRow(usage: Usage, effort: Effort, variant: Variant, labelWidth: number): Span[] {
  const effortPart = effortSpans(effort, variant.hasDetails)
  return [
    dot(T.brand),
    ...(variant.hasDetails ? [labelSpan('Model', labelWidth), GAP] : []),
    span(prettyModel(usage.model), { weight: 'bold' }),
    ...(effortPart.length > 0 ? [GAP, ...effortPart] : []),
  ]
}

function leftBlock(usage: Usage, effort: Effort, fable: LimitWindow | undefined, now: number, variant: Variant): Span[][] {
  const shown = meters(usage, fable, now)
  const labelWidth = Math.max(textWidth('Model'), ...shown.map(meter => textWidth(variant.isShort ? meter.short : meter.label)))
  return [modelRow(usage, effort, variant, labelWidth), ...shown.map(meter => meterRow(meter, variant, labelWidth))]
}

// Only the number carries the state's color; the whole of it opens the pull request.
const pullRequestSpans = (pr: PullRequest, withLabel: boolean): Span[] => [
  ...(withLabel ? [span('PR ', { color: T.muted }, pr.url)] : []),
  span(`#${pr.number}`, { color: pullRequestColor(pr), weight: 'bold', underline: true }, pr.url),
]

// A detached HEAD shows its commit where the branch would be, as starship's git_commit does.
function headSpans(git: Git, width = Number.POSITIVE_INFINITY): Span[] {
  const head =
    git.branch === undefined
      ? span(`(${git.commit ?? '?'})`, { color: T.commit, weight: 'bold' })
      : span(truncate(git.branch, width), { color: T.branch, weight: 'bold' })
  const operation = git.operation ? [span(` (${git.operation.toUpperCase()})`, { color: T.gitStatus, weight: 'bold' })] : []
  return [head, ...operation]
}

type GitCut = { branch: number; path: number }

const UNCUT: GitCut = { branch: Number.POSITIVE_INFINITY, path: Number.POSITIVE_INFINITY }

const gitSpans = (git: Git, pr: PullRequest | undefined, cut: GitCut): Span[] =>
  join([[span(truncateStart(git.path, cut.path), { color: T.path, weight: 'bold' })], headSpans(git, cut.branch), pr ? pullRequestSpans(pr, true) : []])

// ~/path/to/project · branch (OPERATION) · PR #n on one row. Too wide, the branch is cut first, then
// the path from its start (the folder's own name is the part worth keeping), then the pull request is left
// out, and last the path.
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
  // Narrower still, the branch alone: where the session is matters less than what it is on.
  const row = attempts.find(one => rowWidth(one) <= columns) ?? headSpans(git, columns)
  return row ? [row] : []
}

export type Facts = { costCents?: number; mode?: Mode; agents: Agents | null }

type Fact = { label: string; value: Span[] }

function otherFacts(facts: Facts): Fact[] {
  const { costCents, mode, agents } = facts
  return [
    ...(costCents !== undefined ? [{ label: '비용', value: [span(formatCost(costCents), { weight: 'bold' })] }] : []),
    ...(mode !== undefined ? [{ label: '모드', value: [span(MODE_NAMES[mode], { color: T.mode[mode] ?? T.label, weight: 'bold' })] }] : []),
    ...(agents !== null
      ? [
          {
            label: '에이전트',
            value: agents.active > 0 ? [span(`${agents.active}개 실행 중`, { color: T.active, weight: 'bold' })] : [span('쉬는 중', { color: T.muted })],
          },
        ]
      : []),
  ]
}

function gitFacts(git: Git | null, pr: PullRequest | undefined): Fact[] {
  if (git === null) return []
  return [
    { label: '경로', value: [span(git.path, { color: T.path, weight: 'bold' })] },
    { label: '브랜치', value: headSpans(git) },
    ...(pr ? [{ label: 'PR', value: pullRequestSpans(pr, false) }] : []),
  ]
}

function rightBlock(facts: readonly Fact[]): Span[][] {
  const labelWidth = Math.max(0, ...facts.map(fact => textWidth(fact.label)))
  return facts.map(fact => [span(fact.label + ' '.repeat(labelWidth - textWidth(fact.label)), { color: T.muted }), GAP, ...fact.value])
}

// Facts side by side while they fit, each on the next row when it does not.
function pack(groups: readonly Span[][], columns: number): Span[][] {
  return groups.reduce<Span[][]>((rows, group) => {
    const last = rows.at(-1)
    const joined = last === undefined ? group : join([last, group])
    if (last !== undefined && rowWidth(joined) <= columns) return [...rows.slice(0, -1), joined]
    return [...rows, group]
  }, [])
}

const blockWidth = (rows: readonly Span[][]) => Math.max(0, ...rows.map(rowWidth))

// The left rows padded to one width, the divider, the right rows; the shorter block padded with blank rows.
function besideRows(left: readonly Span[][], right: readonly Span[][]): Span[][] {
  const width = blockWidth(left)
  return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => {
    const row = right[index]
    const own = padTo(left[index] ?? [], width)
    return row === undefined ? merged(own) : merged([...own, ...DIVIDER, ...row])
  })
}

export type StatusInput = {
  usage: Usage
  effort: Effort
  fable: LimitWindow | undefined
  git: Git | null
  pr: PullRequest | undefined
  facts: Facts
}

export function statusRows(input: StatusInput, columns: number, now: number): Span[][] {
  const { usage, effort, fable, git, pr, facts } = input
  const lefts = VARIANTS.map(variant => leftBlock(usage, effort, fable, now, variant))
  const right = rightBlock([...gitFacts(git, pr), ...otherFacts(facts)])
  // The facts stay beside only while the meters keep their details: a meter's countdown is worth
  // more than the facts' place.
  const beside = lefts.find((left, index) => VARIANTS[index]?.hasDetails === true && blockWidth(left) + rowWidth(DIVIDER) + blockWidth(right) <= columns)
  if (beside !== undefined || right.length === 0) {
    const left = beside ?? lefts.find(one => blockWidth(one) <= columns) ?? lefts.at(-1) ?? []
    return right.length === 0 ? left : besideRows(left, right)
  }
  // Under the left block: the git part on a row, the rest packed after it.
  const left = lefts.find(one => blockWidth(one) <= columns) ?? lefts.at(-1) ?? []
  const others = otherFacts(facts).map(fact => [span(`${fact.label} `, { color: T.muted }), ...fact.value])
  return [...left, ...gitRows(git, pr, columns), ...pack(others, columns)]
}
