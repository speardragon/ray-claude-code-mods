// status-line: a status line under the prompt.
//   Below the engine's own hint line it draws a git row (path · branch · pull request) and a usage
//   row (model and effort, the context window, the five-hour and weekly plan limits, Fable's own),
//   each limit as a bar whose color follows what is left. The rows fold as the terminal narrows.
//   Figures come from the engine ($.session.usage), the repository from git, the pull request from gh,
//   the Fable limit from the plan's usage endpoint.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Effort, FableReading, Git, PullRequestReading, Usage } from '../types'
import { configuredEffort, effortFrom, effortOfStep, isModelSwitch } from './effort'
import { isFable } from './fable'
import { markPullRequestStale, refreshGit, refreshUsage } from './feeds'
import { gitRows, usageRows } from './layout'
import { isSame } from './same'
import type { Span } from './theme'

// What the line draws from, held by the host so a hot reload keeps it. The validator reads each
// atom where it is used, so a file that reads one declares it.
const usageAtom = atom({ plugin: 'status-line', key: 'usage' } as const, null as Usage | null)
const effortAtom = atom({ plugin: 'status-line', key: 'effort' } as const, { kind: 'unknown' } as Effort)
const gitAtom = atom({ plugin: 'status-line', key: 'git' } as const, null as Git | null)
const prAtom = atom({ plugin: 'status-line', key: 'pr' } as const, null as PullRequestReading | null)
const fableAtom = atom({ plugin: 'status-line', key: 'fable' } as const, null as FableReading | null)

const USAGE_TICK_MS = 60_000 // the countdowns move by the minute
const GIT_TICK_MS = 30_000 // changes made outside the session (another terminal) show within this
const FOOTER_INSET = 4 // the hint line is told the screen's width; its margins come off it
// Before the surface has been measured: a terminal is assumed wide, a phone narrow.
const FALLBACK_COLUMNS: Readonly<Record<string, number>> = { terminal: 120, desktop: 100, vscode: 80, mobile: 40 }
const MIN_COLUMNS = 20
const OPENERS = ['open', 'xdg-open'] // macOS, then Linux
const PR_COMMAND = /\b(?:gh\s+pr|git\s+push)\b/
// A tool that may have changed files or the branch: git is read again when one ends.
const WATCHED_TOOLS = ['Bash', 'Edit', 'Write', 'NotebookEdit', 'EnterWorktree', 'ExitWorktree'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The words of a transcript row, whether its content is a string or blocks.
function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(block => (isRecord(block) && typeof block.text === 'string' ? block.text : '')).join('\n')
}

async function setEffort($: EngineInterface, effort: Effort): Promise<void> {
  try {
    if (!isSame(await read($, effortAtom), effort)) await update($, effortAtom, () => effort)
  } catch {
    // The line's own trouble never reaches the turn it was reading.
  }
}

// Fills every atom the line reads. Safe to call again: it only writes what differs.
async function prime($: EngineInterface, account: string): Promise<void> {
  if ((await read($, effortAtom)).kind === 'unknown') await setEffort($, await configuredEffort($))
  await Promise.all([refreshUsage($), refreshGit($, account)])
}

async function openUrl($: EngineInterface, url: string): Promise<void> {
  for (const opener of OPENERS) {
    const run = await $.process.run([opener, url]).catch(() => null)
    if (run?.exitCode === 0) return
  }
  $.ui.log(`status-line: could not open ${url}`, { to: 'debug' })
}

// Neighbouring spans that open the same address (or none) as one run.
function runsOf(row: readonly Span[]): { href?: string; parts: Span[] }[] {
  return row.reduce<{ href?: string; parts: Span[] }[]>((runs, part) => {
    const last = runs.at(-1)
    if (last !== undefined && last.href === part.href) return [...runs.slice(0, -1), { ...last, parts: [...last.parts, part] }]
    return [...runs, { ...(part.href !== undefined ? { href: part.href } : {}), parts: [part] }]
  }, [])
}

export const register: Register = (on, options) => {
  const account = typeof options.githubAccount === 'string' ? options.githubAccount.trim() : ''
  // The module's own bookkeeping; a reload starts it over.
  let timers: Timer[] = []
  let isLive = false
  let isPriming = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    isLive = e.isInteractive
    if (!isLive) return result
    timers.forEach(timer => timer.cancel())
    timers = [
      $.clock.every(USAGE_TICK_MS, () => void refreshUsage($)),
      $.clock.every(GIT_TICK_MS, () => void refreshGit($, account)),
    ]
    $.clock.after(0, () => void prime($, account))
    return result
  })

  // Every reading of the context window and the limits.
  on('session.measure', ($, e, next) => {
    if (isLive) $.clock.after(0, () => void refreshUsage($))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The effort the main thread's request really carries. The stream passes through untouched.
  on('turn.step', async function* ($, e, next) {
    if (isLive && e.agentId === undefined) {
      const effort = effortOfStep(e.effort)
      $.clock.after(0, () => void setEffort($, effort))
    }
    return yield* next(e)
  })

  // /effort and /model leave a line in the transcript: the row shows the change before the next request.
  on('session.append', { door: ['command', 'notice'] }, ($, e, next) => {
    if (!isLive) return next(e)
    const text = textOf(e.message.content)
    const level = effortFrom(text)
    if (level !== undefined) $.clock.after(0, () => void setEffort($, { kind: 'level', level }))
    else if (isModelSwitch(text)) $.clock.after(0, () => void configuredEffort($).then(effort => setEffort($, effort)))
    if (isModelSwitch(text)) $.clock.after(0, () => void refreshUsage($))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The tool's result passes through untouched; a write, a push or a `gh pr` command reads git again.
  on('tool.call', { tool: WATCHED_TOOLS }, async ($, e, next) => {
    const result = await next(e)
    if (!isLive) return result
    const touchesPullRequest = e.tool === 'Bash' && PR_COMMAND.test(e.command)
    if (touchesPullRequest) markPullRequestStale()
    const isWrite = result.deny === undefined && result.isError !== true && result.isReadOnly !== true
    if (touchesPullRequest || isWrite) $.clock.after(0, () => void refreshGit($, account))
    return result
  }).catch(($, e, next) => next(e))

  // The hint line under the prompt. Keeping the engine's own drawing (`next`) keeps its line alive
  // (mode, shortcuts, pills); the rows go under it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const own = await next(e)
    const [usage, effort, git, pr, fable] = await Promise.all([
      read($, usageAtom),
      read($, effortAtom),
      read($, gitAtom),
      read($, prAtom),
      read($, fableAtom),
    ])
    if (usage === null) {
      // /clear empties the session's state without starting the session again: fill it from a timer,
      // as a drawing may not write.
      if (isLive && !isPriming) {
        isPriming = true
        $.clock.after(0, () => void prime($, account).finally(() => (isPriming = false)))
      }
      return own
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = Math.max(MIN_COLUMNS, (e.viewport?.columns ?? FALLBACK_COLUMNS[e.surface] ?? 80) - FOOTER_INSET)
    const now = await $.clock.now()
    const shownPr = git !== null && pr !== null && pr.key === git.prKey ? pr.value : undefined
    const shownFable = isFable(usage.model) ? fable?.window : undefined
    const rows = [...gitRows(git, shownPr, columns), ...usageRows(usage, effort, shownFable, columns, now)]

    // Bars and columns only line up in one-width letters: a surface with a proportional face is asked
    // for its monospaced one (the terminal has no other).
    const draw = (part: Span) => (part.paint === undefined ? part.text : <Text {...part.paint}>{part.text}</Text>)
    // A button cannot sit inside a Text, so a row with one is a row of Texts and Buttons.
    const drawRow = (row: Span[]) => {
      const runs = runsOf(row)
      if (runs.every(run => run.href === undefined)) return (
        <Text mono wrap="truncate-end">
          {row.map(draw)}
        </Text>
      )
      return (
        <Box flexDirection="row">
          {runs.map(run => {
            const { href } = run
            if (href === undefined) return <Text mono>{run.parts.map(draw)}</Text>
            return (
              <Button plain key={`open:${href}`} onPress={() => void openUrl($, href)}>
                <Text mono>{run.parts.map(draw)}</Text>
              </Button>
            )
          })}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {own}
        <Box flexDirection="column">{rows.map(drawRow)}</Box>
      </Box>
    )
  })
}
