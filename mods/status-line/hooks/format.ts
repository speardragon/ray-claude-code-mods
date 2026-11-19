// Short forms of the figures the line shows: a model's name, a token count, the time to a reset, a cost.

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

// The time to a reset in Korean: 6일 21시간, 2시간 13분, 10분; `곧` once it has passed.
export function resetIn(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return undefined
  if (at <= now) return '곧'
  const minutes = Math.ceil((at - now) / MINUTE_MS)
  const days = Math.floor(minutes / DAY_MINUTES)
  const hours = Math.floor((minutes % DAY_MINUTES) / 60)
  const parts =
    days > 0
      ? [`${days}일`, hours > 0 ? `${hours}시간` : '']
      : hours > 0
        ? [`${hours}시간`, minutes % 60 > 0 ? `${minutes % 60}분` : '']
        : [`${minutes}분`]
  return parts.filter(part => part !== '').join(' ')
}

// 124 → $1.24.
export const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`
