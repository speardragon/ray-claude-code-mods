// The permission mode, read from the engine's hint line: the engine hands a mod no live read of it.
// A line that names none (the default mode, or a passing message in its place) reads as none.

export type Mode = 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

const PATTERNS: readonly (readonly [RegExp, Mode])[] = [
  [/\baccept edits on\b/i, 'acceptEdits'],
  [/\bplan mode on\b/i, 'plan'],
  [/\bauto mode on\b/i, 'auto'],
  [/\bbypass permissions (?:mode )?on\b/i, 'bypassPermissions'],
]

export const MODE_NAMES: Readonly<Record<Mode, string>> = {
  acceptEdits: '편집 자동 수락',
  plan: '플랜',
  auto: '자동',
  bypassPermissions: '권한 우회',
}

export const modeOf = (hint: string): Mode | undefined => PATTERNS.find(([pattern]) => pattern.test(hint))?.[1]
