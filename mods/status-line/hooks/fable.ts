// The Fable-only weekly limit. The engine hands a mod the five-hour and weekly windows but not the
// per-model ones, so this one is read where /usage reads it: the plan's usage endpoint, called with
// the session's own login. The token never passes through the mod: the engine attaches it to the
// request from a handle, and only to this host.
import type { EngineInterface } from 'claude-code'

import type { FableReading } from '../types'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA = 'oauth-2025-04-20'

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export const isFable = (model: string) => /fable/i.test(model)

function modelNameOf(row: Json): string | undefined {
  const model = isRecord(row.scope) ? row.scope.model : undefined
  const name = isRecord(model) ? model.display_name : undefined
  return typeof name === 'string' ? name : undefined
}

// The `weekly_scoped` row whose model is Fable. No such row, or an answer of another shape, reads
// as no limit: nothing is made up.
export function fableOf(body: unknown, now: number): FableReading {
  const rows = isRecord(body) && Array.isArray(body.limits) ? body.limits.filter(isRecord) : []
  const row = rows.find(one => one.kind === 'weekly_scoped' && isFable(modelNameOf(one) ?? '') && typeof one.percent === 'number')
  if (row === undefined || typeof row.percent !== 'number') return { fetchedAt: now }
  return {
    fetchedAt: now,
    window: { percentUsed: row.percent, ...(typeof row.resets_at === 'string' ? { resetsAt: row.resets_at } : {}) },
  }
}

// Null where the session is not logged in to a plan (an API key, a gateway): there is no limit to read.
// Throws on a refused or failed request (a 401 is an expired login, which the next turn renews).
export async function fetchFable($: EngineInterface, now: number): Promise<FableReading | null> {
  // The handle holds the token as of now, so a fresh one is taken for each request.
  const auth = await $.session.authorize()
  if (auth === null || auth.kind !== 'bearer') return null
  const response = await $.http.fetch(USAGE_URL, { headers: { 'anthropic-beta': OAUTH_BETA }, auth: auth.handle })
  if (!response.ok) throw new Error(`the usage endpoint answered ${response.status}`)
  return fableOf(JSON.parse(response.text), now)
}
