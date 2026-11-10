// The effort level in force: guessed from settings before the first request, read from each request
// after, and from the line /effort or /model leaves in the transcript in between.
import type { EngineInterface } from 'claude-code'

import type { Effort } from '../types'

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

const isLevel = (value: unknown): value is string => typeof value === 'string' && EFFORT_LEVELS.includes(value)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// /effort leaves "Set effort level to max", or "...; set to 'high' instead" where a cap applies.
export function effortFrom(text: string): string | undefined {
  const match =
    /\beffort '[a-z]+' exceeds the cap\b[^;]*; set to '([a-z]+)' instead/i.exec(text) ??
    /\bset effort level to ([a-z]+)/i.exec(text)
  const level = match?.[1]?.toLowerCase()
  return isLevel(level) ? level : undefined
}

// /model leaves "Set model to `Sonnet 5.5` ...".
export const isModelSwitch = (text: string) => /\bset model to\b/i.test(text)

export const effortOfStep = (effort: string | number | undefined): Effort =>
  effort === undefined ? { kind: 'none' } : { kind: 'level', level: String(effort) }

// What the engine will most likely send: the environment, then the model's own setting, then effortLevel.
export async function configuredEffort($: EngineInterface): Promise<Effort> {
  try {
    const [fromEnv, settings, model] = await Promise.all([
      $.env.get('CLAUDE_CODE_EFFORT_LEVEL'),
      $.settings.read() as Promise<Record<string, unknown>>,
      $.session.model(),
    ])
    const perModel = isRecord(settings.modelSettings) ? settings.modelSettings[model] : undefined
    const level = [fromEnv, isRecord(perModel) ? perModel.effortLevel : undefined, settings.effortLevel].find(isLevel)
    return level === undefined ? { kind: 'unknown' } : { kind: 'level', level }
  } catch {
    return { kind: 'unknown' }
  }
}
