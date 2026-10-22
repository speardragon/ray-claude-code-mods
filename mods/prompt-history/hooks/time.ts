// When a prompt was sent, as a person reads it: "3분 전" / "3m ago", then a date once it is a week old.
// Formatted by hand from a fixed UTC offset, so the result does not depend on the runtime's locale data.
import type { Locale } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The wall-clock fields of `ms` at `offset` minutes east of UTC.
function fields(ms: number, offset: number) {
  const d = new Date(ms + offset * MINUTE)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }
}

const dayNumber = (ms: number, offset: number) => Math.floor((ms + offset * MINUTE) / DAY)

export function date(ms: number, now: number, offset: number, locale: Locale): string {
  const f = fields(ms, offset)
  const sameYear = f.y === fields(now, offset).y
  if (locale === 'ko') return sameYear ? `${f.mo + 1}월 ${f.d}일` : `${f.y}. ${f.mo + 1}. ${f.d}.`
  return sameYear ? `${MONTHS_EN[f.mo]} ${f.d}` : `${MONTHS_EN[f.mo]} ${f.d}, ${f.y}`
}

export function relative(ms: number, now: number, offset: number, locale: Locale): string {
  const ago = Math.max(0, now - ms)
  const ko = locale === 'ko'
  if (ago < 45_000) return ko ? '방금 전' : 'just now'
  if (ago < HOUR) {
    const n = Math.max(1, Math.round(ago / MINUTE))
    return ko ? `${n}분 전` : `${n}m ago`
  }
  if (ago < DAY) {
    const n = Math.floor(ago / HOUR)
    return ko ? `${n}시간 전` : `${n}h ago`
  }
  if (ago < 7 * DAY) {
    const n = Math.floor(ago / DAY)
    return ko ? `${n}일 전` : `${n}d ago`
  }
  return date(ms, now, offset, locale)
}

export function clock(ms: number, offset: number, locale: Locale): string {
  const { h, mi } = fields(ms, offset)
  const mm = String(mi).padStart(2, '0')
  const h12 = h % 12 === 0 ? 12 : h % 12
  return locale === 'ko' ? `${h < 12 ? '오전' : '오후'} ${h12}:${mm}` : `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

// The heading over a day's prompts in the list: 오늘 / 어제 / 10월 20일 (월).
export function dayLabel(ms: number, now: number, offset: number, locale: Locale): string {
  const diff = dayNumber(now, offset) - dayNumber(ms, offset)
  if (diff === 0) return locale === 'ko' ? '오늘' : 'Today'
  if (diff === 1) return locale === 'ko' ? '어제' : 'Yesterday'
  const wd = fields(ms, offset).wd
  return `${date(ms, now, offset, locale)} (${locale === 'ko' ? WEEKDAYS_KO[wd] : WEEKDAYS_EN[wd]})`
}

export const sameDay = (a: number, b: number, offset: number) => dayNumber(a, offset) === dayNumber(b, offset)

// `date +%z`'s "+0900" as minutes east of UTC.
export function parseOffset(text: string): number | null {
  const m = text.trim().match(/^([+-])(\d{2})(\d{2})$/)
  if (!m) return null
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -minutes : minutes
}
