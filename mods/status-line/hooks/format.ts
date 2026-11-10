// Short forms of the figures the line shows: a model's name, a token count, the time to a reset.

const MINUTE_MS = 60_000
const DAY_MINUTES = 1440
const MILLION = 1_000_000

const capitalize = (word = '') => word.charAt(0).toUpperCase() + word.slice(1)
const version = (major = '', minor?: string) => (minor === undefined ? major : `${major}.${minor}`)

// claude-opus-5-5 → Opus 5.5; claude-3-5-sonnet-20241022 → Sonnet 3.5; anything else as given.
export function prettyModel(id: string): string {
  const base = id.replace(/\[[^\]]*\]$/, '')
  const named = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(base)
  if (named) return `${capitalize(named[1])} ${version(named[2], named[3])}`
  const legacy = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/.exec(base)
  if (legacy) return `${capitalize(legacy[3])} ${version(legacy[1], legacy[2])}`
  return base === '' ? '?' : base
}

// 715000 → 715k, 1000000 → 1M, 1200000 → 1.2M.
export function formatTokens(count: number): string {
  if (count >= 999_500) return `${(count / MILLION).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1000) return `${Math.round(count / 1000)}k`
  return String(count)
}

export type ResetStyle = 'minutes' | 'hours'

// The five-hour window counts to the minute (3h54m); the weekly one in days, or hours on its last day.
export function resetIn(resetsAt: string | undefined, now: number, style: ResetStyle): string | undefined {
  if (resetsAt === undefined) return undefined
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return undefined
  if (at <= now) return 'now'
  const minutes = Math.ceil((at - now) / MINUTE_MS)
  const days = Math.floor(minutes / DAY_MINUTES)
  const hours = Math.floor((minutes % DAY_MINUTES) / 60)
  if (days > 0) return style === 'hours' ? `${days}d` : `${days}d${hours}h`
  if (hours === 0) return `${minutes}m`
  return style === 'hours' ? `${hours}h` : `${hours}h${minutes % 60}m`
}
